/**
 * SIP Media Endpoint — รับสาย SIP + RTP Audio จาก SBC
 * 
 * ใช้ Werift (WebRTC/RTCP/SIP) library เพื่อ:
 * - ฟัง SIP INVITE จาก SBC
 * - ตอบรับสาย (200 OK)
 * - รับ RTP Audio
 * - ส่ง Audio chunks ไปยัง Azure Speech-to-Text
 * - สั่ง Transfer ผ่าน SIP Refer
 */

import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { EventEmitter } from 'node:events';
import { getConfig } from './config-manager.js';
import { emitInfo, emitAi, emitTransfer, emitError, emitCallEvent } from './system-logger.js';

// ── Types ──────────────────────────────────────────────────────────

interface SipMessage {
  method?: string;
  code?: number;
  headers: Record<string, string>;
  body?: string;
}

interface ActiveCall {
  sessionId: string;
  caller: string;
  callee: string;
  rtpPort: number;
  callId: string;
  tag: string;
  seq: number;
  remoteAddr: string;
  remotePort: number;
  transport: 'udp' | 'tcp';
  tcpSocket?: import('node:net').Socket;
  sbcIp?: string; // SBC's real IP (from Via header), for Contact header in TCP calls
  sbcMediaHost?: string; // SBC's media IP from INVITE SDP
  sbcMediaPort?: number; // SBC's media port from INVITE SDP
  botRtpPort?: number;   // Bot's local RTP port for this call
}

// ── G.711 μ-law lookup tables ──────────────────────────────────────

const MU_LAW_DECODE: number[] = new Array(256);
const A_LAW_DECODE: number[] = new Array(256);

function initG711Tables(): void {
  for (let i = 0; i < 256; i++) {
    // μ-law decode
    const mulaw = i ^ 0xff;
    const sign = mulaw & 0x80;
    let exponent = (mulaw >> 4) & 0x07;
    let mantissa = mulaw & 0x0f;
    let sample = ((exponent === 0 ? 0 : 0x10) | mantissa) << (exponent + 3);
    if (sign) sample = -sample;
    MU_LAW_DECODE[i] = sample;

    // A-law decode
    const alaw = i ^ 0x55;
    const asign = alaw & 0x80;
    let aexponent = (alaw >> 4) & 0x07;
    let amantissa = alaw & 0x0f;
    let asample = ((aexponent === 0 ? 0 : 0x10) | amantissa) << (aexponent + 3);
    if (asign) asample = -asample;
    A_LAW_DECODE[i] = asample;
  }
}
initG711Tables();

// ── RTP Packet Parser ──────────────────────────────────────────────

interface RtpPacket {
  payloadType: number;
  sequence: number;
  timestamp: number;
  ssrc: number;
  payload: Buffer;
}

function parseRtpPacket(buf: Buffer): RtpPacket | null {
  if (buf.length < 12) return null;
  const version = buf[0] >> 6;
  if (version !== 2) return null;
  const cc = buf[0] & 0x0f;
  const payloadType = buf[1] & 0x7f;
  const sequence = buf.readUInt16BE(2);
  const timestamp = buf.readUInt32BE(4);
  const ssrc = buf.readUInt32BE(8);
  const headerLen = 12 + cc * 4;
  const payload = buf.subarray(headerLen);
  return { payloadType, sequence, timestamp, ssrc, payload };
}

function decodeG711To16Bit(payload: Buffer, isAlaw: boolean): Int16Array {
  const samples = new Int16Array(payload.length);
  const table = isAlaw ? A_LAW_DECODE : MU_LAW_DECODE;
  for (let i = 0; i < payload.length; i++) {
    samples[i] = table[payload[i]];
  }
  return samples;
}

// ── SIP Endpoint Class ─────────────────────────────────────────────

export class SipMediaEndpoint extends EventEmitter {
  private sipPort: number;
  private rtpPortBase: number;
  private sipSocket!: ReturnType<typeof createSocket>;
  private tcpServer!: ReturnType<typeof createServer>;
  private rtpSockets: Map<string, ReturnType<typeof createSocket>> = new Map();
  private calls: Map<string, ActiveCall> = new Map();
  private running = false;
  private ssrcCounter = 1000;
  private nextRtpPort = 0;
  private tunnelHostname = '';
  private tunnelPort = 0;

  // ASR buffer
  public onAudioData?: (sessionId: string, audioBuffer: Int16Array) => void;
  public onCallEnded?: (sessionId: string) => void;

  constructor(sipPort = 5060, rtpPortBase = 10000) {
    super();
    this.sipPort = sipPort;
    this.rtpPortBase = rtpPortBase;
    this.nextRtpPort = rtpPortBase;
  }

  /** Set the ngrok tunnel hostname:port so the Contact header points
   *  through the tunnel, avoiding SBC loopback to its own IP. */
  setTunnel(hostname: string, port: number): void {
    this.tunnelHostname = hostname;
    this.tunnelPort = port;
  }

  listen(): void {
    if (this.running) return;
    this.running = true;

    try {
      // ── UDP Socket (for local SIP) ──────────────────────────────
      this.sipSocket = createSocket('udp4');
      
      this.sipSocket.on('message', (msg, rinfo) => {
        this.handleSipData(msg.toString('utf-8'), rinfo.address, rinfo.port);
      });

      this.sipSocket.on('error', (err: any) => {
        console.error(`[SIP] UDP error: ${err.message}`);
        emitError(`[SIP] UDP error: ${err.message}`);
      });

      this.sipSocket.bind(this.sipPort, '0.0.0.0', () => {
        emitInfo(`[SIP] UDP endpoint listening on port ${this.sipPort}`);
      });

      // ── TCP Server (for Ngrok tunnel — SBC sends TCP via Ngrok) ─
      this.tcpServer = createServer((socket) => {
        const remoteAddr = socket.remoteAddress || '0.0.0.0';
        const remotePort = socket.remotePort || 0;
        console.log(`[SIP] TCP connection from ${remoteAddr}:${remotePort}`);

        let buffer = '';
        socket.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          // SIP messages end with \r\n\r\n (or double CRLF after Content-Length)
          if (buffer.includes('\r\n\r\n') || buffer.includes('\n\n')) {
            this.handleSipData(buffer, remoteAddr, remotePort, socket);
            buffer = '';
          }
        });
        socket.on('error', (err) => {
          console.error(`[SIP] TCP socket error: ${err.message}`);
        });
        socket.on('close', () => {
          console.log(`[SIP] TCP connection closed: ${remoteAddr}:${remotePort}`);
        });
      });

      this.tcpServer.on('error', (err: any) => {
        console.error(`[SIP] TCP server error: ${err.message}`);
        emitError(`[SIP] TCP server error: ${err.message}`);
      });

      this.tcpServer.listen(this.sipPort, '0.0.0.0', () => {
        emitInfo(`[SIP] TCP endpoint listening on port ${this.sipPort}`);
      });
    } catch (err: any) {
      console.error(`[SIP] Failed to start: ${err.message}`);
      emitError(`[SIP] Failed to start: ${err.message}`);
      this.running = false;
    }
  }

  private handleSipData(text: string, remoteAddr: string, remotePort: number, tcpSocket?: import('node:net').Socket): void {
    const sipMsg = this.parseSipMessage(text);
    if (sipMsg.method === 'INVITE') {
      this.handleInvite(sipMsg, remoteAddr, remotePort, tcpSocket);
    } else if (sipMsg.method === 'ACK') {
      this.handleAck(sipMsg);
    } else if (sipMsg.method === 'BYE') {
      this.handleBye(sipMsg);
    } else if (sipMsg.method === 'CANCEL') {
      this.handleCancel(sipMsg);
    }
  }

  close(): void {
    this.running = false;
    this.sipSocket?.close();
    this.tcpServer?.close();
    for (const [id, sock] of this.rtpSockets) {
      sock.close();
    }
    this.rtpSockets.clear();
    this.calls.clear();
  }

  // ── Send SIP Transfer (Refer) ──────────────────────────────────
  sendTransfer(sessionId: string, targetSipUri: string): void {
    const call = this.calls.get(sessionId);
    if (!call) return;

    const transportParam = call.transport === 'tcp' ? ';transport=tcp' : '';
    // For TCP calls, use the tunnel hostname in Contact so the SBC
    // routes in-dialog requests through its ProxySet back to us.
    let contactHost = this.getLocalIp();
    let contactPort = this.sipPort;
    if (call.transport === 'tcp' && this.tunnelHostname) {
      contactHost = this.tunnelHostname;
      contactPort = this.tunnelPort;
    } else if (call.sbcIp) {
      contactHost = call.sbcIp;
    }
    const referMsg = [
      `REFER sip:${call.callee}@${this.sipPort} SIP/2.0`,
      `Via: SIP/2.0/${call.transport === 'tcp' ? 'TCP' : 'UDP'} ${this.getLocalIp()}:${this.sipPort}`,
      `From: <sip:bot@${this.getLocalIp()}>;tag=${call.tag}`,
      `To: <sip:${call.callee}@${this.getLocalIp()}>`,
      `Call-ID: ${call.callId}`,
      `CSeq: ${++call.seq} REFER`,
      `Refer-To: <${targetSipUri}>`,
      `Contact: <sip:bot@${contactHost}:${contactPort}${transportParam}>`,
      'Content-Length: 0',
      '',
    ].join('\r\n');

    const buf = Buffer.from(referMsg);
    if (call.tcpSocket && !call.tcpSocket.destroyed) {
      call.tcpSocket.write(buf);
    } else {
      this.sipSocket.send(buf, call.remotePort, call.remoteAddr);
    }
    emitTransfer(`[SIP] Sent REFER to ${targetSipUri}`);
  }

  // ── Private methods ──────────────────────────────────────────

  private getLocalIp(): string {
    // Get the actual machine IP (not 127.0.0.1) so SBC can send RTP audio
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private getNextRtpPort(): number {
    const port = this.nextRtpPort;
    this.nextRtpPort += 2;
    return port;
  }

  private parseSipMessage(text: string): SipMessage {
    const lines = text.split('\r\n');
    const firstLine = lines[0] || '';
    const headers: Record<string, string> = {};
    let body = '';
    let inBody = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') { inBody = true; continue; }
      if (inBody) { body += lines[i]; continue; }
      const colonIdx = lines[i].indexOf(':');
      if (colonIdx > 0) {
        headers[lines[i].slice(0, colonIdx).trim().toLowerCase()] = lines[i].slice(colonIdx + 1).trim();
      }
    }

    let method: string | undefined;
    let code: number | undefined;

    if (firstLine.startsWith('SIP/2.0')) {
      code = parseInt(firstLine.split(' ')[1], 10);
    } else {
      method = firstLine.split(' ')[0];
    }

    return { method, code, headers, body };
  }

  private handleInvite(msg: SipMessage, remoteAddr: string, remotePort: number, tcpSocket?: import('node:net').Socket): void {
    const callId = msg.headers['call-id'] || `call-${Date.now()}`;
    const from = msg.headers['from'] || '';
    const to = msg.headers['to'] || '';
    const caller = from.match(/sip:(\d+)@/)?.[1] || 'unknown';
    const callee = to.match(/sip:(\d+)@/)?.[1] || 'unknown';

    // Parse SDP for media port and SBC's media IP
    let sbcMediaPort = 0;
    let sbcMediaHost = '';
    if (msg.body) {
      const portMatch = msg.body.match(/m=audio (\d+)/);
      if (portMatch) sbcMediaPort = parseInt(portMatch[1], 10);
      const ipMatch = msg.body.match(/c=IN IP4 (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) sbcMediaHost = ipMatch[1];
    }

    const myPort = this.getNextRtpPort();
    const tag = `bot-${Date.now()}`;
    const sessionId = callId;

    const transport = tcpSocket ? 'tcp' : 'udp';
    // Extract SBC's real IP from Via header (for TCP/ngrok calls)
    let sbcIp: string | undefined;
    if (tcpSocket) {
      const viaMatch = msg.headers.via?.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (viaMatch) sbcIp = viaMatch[1];
    }
    const call: ActiveCall = {
      sessionId,
      caller,
      callee,
      rtpPort: sbcMediaPort,
      callId,
      tag,
      seq: 1,
      remoteAddr,
      remotePort,
      transport,
      tcpSocket,
      sbcIp,
      sbcMediaHost: sbcMediaHost || sbcIp,
      sbcMediaPort,
      botRtpPort: myPort,
    };
    this.calls.set(sessionId, call);

    emitInfo(`[SIP] Incoming call from ${caller} to ${callee}`);
    emitCallEvent('call-started', sessionId, caller);

    // Create RTP socket for receiving audio
    const rtpSocket = createSocket('udp4');
    this.rtpSockets.set(sessionId, rtpSocket);

    rtpSocket.on('message', (rtpData) => {
      const packet = parseRtpPacket(rtpData);
      if (!packet) return;

      // Decode G.711 PCMU (payload type 0) or PCMA (payload type 8)
      if (packet.payloadType === 0 || packet.payloadType === 8) {
        const isAlaw = packet.payloadType === 8;
        const samples = decodeG711To16Bit(packet.payload, isAlaw);
        if (this.onAudioData) {
          this.onAudioData(sessionId, samples);
        }
      }
    });

    rtpSocket.bind(myPort, '0.0.0.0');

    // ── Build SDP — loop audio back through SBC's media processor ─
    // The SBC's StreamsConnector bridges phone ↔ bot sides.
    // By pointing the SDP back to the SBC's own IP:mediaPort, the SBC
    // sends phone audio to itself, creating a hairpin loop through the
    // StreamsConnector so the phone hears audio (even without bot RTP).
    const sdpMediaHost = tcpSocket && sbcIp ? sbcIp : '127.0.0.1';
    const sdpMediaPort = tcpSocket && sbcIp && sbcMediaPort ? sbcMediaPort : myPort;
    const sdp = [
      'v=0',
      `o=- 0 0 IN IP4 ${sdpMediaHost}`,
      's=SBC Bot Media',
      `c=IN IP4 ${sdpMediaHost}`,
      't=0 0',
      `m=audio ${sdpMediaPort} RTP/AVP 0`,
      'a=rtpmap:0 PCMU/8000',
      'a=sendrecv',
      '',
    ].join('\r\n');

    // For TCP connections via ngrok tunnel:
    // Use the tunnel hostname in Contact so the SBC routes in-dialog
    // requests (ACK, BYE) through the ProxySet back to us.
    // Without this, the SBC sends to its own IP and loops back to itself.
    let contactHost = remoteAddr;
    let contactPort = this.sipPort;
    if (tcpSocket && this.tunnelHostname) {
      contactHost = this.tunnelHostname;
      contactPort = this.tunnelPort;
    } else if (tcpSocket && sbcIp) {
      // Fallback: use SBC's IP from Via header (may loopback to SBC)
      contactHost = sbcIp;
    }

    const response = [
      `SIP/2.0 200 OK`,
      `Via: ${msg.headers.via || ''}`,
      `From: ${from}`,
      `To: ${to};tag=${tag}`,
      `Call-ID: ${callId}`,
      `CSeq: ${msg.headers.cseq || '1 INVITE'}`,
      `Contact: <sip:bot@${contactHost}:${contactPort}${tcpSocket ? ';transport=tcp' : ''}>`,
      `Content-Type: application/sdp`,
      `Content-Length: ${Buffer.byteLength(sdp)}`,
      '',
      sdp,
    ].join('\r\n');

    const responseBuf = Buffer.from(response);
    if (tcpSocket) {
      // Send via TCP (Ngrok tunnel)
      tcpSocket.write(responseBuf);
    } else {
      // Send via UDP
      this.sipSocket.send(responseBuf, remotePort, remoteAddr);
    }
    emitInfo(`[SIP] Sent 200 OK for call ${callId}`);
  }

  private handleAck(msg: SipMessage): void {
    // ACK received — call is established
    const callId = msg.headers['call-id'] || '';
    emitInfo(`[SIP] ACK received — call ${callId} established`);
  }

  private handleBye(msg: SipMessage): void {
    const callId = msg.headers['call-id'] || '';
    const call = this.calls.get(callId);
    let remoteAddr = '127.0.0.1';
    let remotePort = this.sipPort;
    let tcpSocket: import('node:net').Socket | undefined;
    if (call) {
      emitInfo(`[SIP] Call ended: ${callId}`);
      emitCallEvent('call-ended', callId, call.caller);
      if (this.onCallEnded) this.onCallEnded(callId);
      remoteAddr = call.remoteAddr;
      remotePort = call.remotePort;
      tcpSocket = call.tcpSocket;

      // Cleanup
      const rtpSock = this.rtpSockets.get(callId);
      if (rtpSock) { rtpSock.close(); this.rtpSockets.delete(callId); }
      this.calls.delete(callId);
    }

    // Send 200 OK for BYE — reuse the same transport as the original INVITE
    const response = [
      `SIP/2.0 200 OK`,
      `Via: ${msg.headers.via || ''}`,
      `From: ${msg.headers.from || ''}`,
      `To: ${msg.headers.to || ''}`,
      `Call-ID: ${callId}`,
      `CSeq: ${msg.headers.cseq || '1 BYE'}`,
      'Content-Length: 0',
      '',
    ].join('\r\n');

    const responseBuf = Buffer.from(response);
    if (tcpSocket && !tcpSocket.destroyed) {
      tcpSocket.write(responseBuf);
    } else {
      this.sipSocket.send(responseBuf, remotePort, remoteAddr);
    }
  }

  private handleCancel(msg: SipMessage): void {
    const callId = msg.headers['call-id'] || '';
    const call = this.calls.get(callId);
    if (call) {
      emitCallEvent('call-ended', callId, call.caller);
      const rtpSock = this.rtpSockets.get(callId);
      if (rtpSock) { rtpSock.close(); this.rtpSockets.delete(callId); }
      this.calls.delete(callId);
    }

    // Send 200 OK for CANCEL per RFC 3261
    const response = [
      `SIP/2.0 200 OK`,
      `Via: ${msg.headers.via || ''}`,
      `From: ${msg.headers.from || ''}`,
      `To: ${msg.headers.to || ''}`,
      `Call-ID: ${callId}`,
      `CSeq: ${msg.headers.cseq || '1 CANCEL'}`,
      'Content-Length: 0',
      '',
    ].join('\r\n');

    this.sipSocket.send(Buffer.from(response), this.sipPort, '127.0.0.1');
  }
}