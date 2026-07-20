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
import { randomBytes } from 'node:crypto';
import { createServer as createTlsServer, type TLSSocket } from 'node:tls';
import { networkInterfaces } from 'node:os';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { getConfig } from './config-manager.js';
import { emitInfo, emitAi, emitTransfer, emitError, emitCallEvent } from './system-logger.js';
import { createSrtpContext, srtpUnprotect, srtpProtect, ProtectionProfile } from '@agentdance/node-webrtc-srtp';
import type { SrtpContext } from '@agentdance/node-webrtc-srtp';

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
  transport: 'udp' | 'tcp' | 'tls';
  tcpSocket?: import('node:net').Socket;
  sbcIp?: string; // SBC's real IP (from Via header), for Contact header in TCP calls
  sbcMediaHost?: string; // SBC's media IP from INVITE SDP
  sbcMediaPort?: number; // SBC's media port from INVITE SDP
  botRtpPort?: number;   // Bot's local RTP port for this call
  mediaRemoteHost?: string;
  mediaRemotePort?: number;
  rtpSeq?: number;
  rtpTimestamp?: number;
  rtpSsrc?: number;
  pendingSpeech?: string[];
  remoteTargetUri?: string;
  localDialogUri?: string;
  remoteDialogUri?: string;
  /** SRTP decrypt context (receiving from SBC) */
  srtpDecrypt?: SrtpContext;
  /** SRTP encrypt context (sending to SBC) */
  srtpEncrypt?: SrtpContext;
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
  private tlsServer?: ReturnType<typeof createTlsServer>;
  private tlsPort: number;
  private tlsEnabled: boolean;
  private srtpEnabled: boolean;
  private srtpProfile: string;
  private rtpSockets: Map<string, ReturnType<typeof createSocket>> = new Map();
  private calls: Map<string, ActiveCall> = new Map();
  private running = false;
  private ssrcCounter = 1000;
  private nextRtpPort = 0;
  private sipAdvertisedHost = '';
  private mediaAdvertisedIp = '';
  private warnedPrivateMediaIp = false;

  // ASR buffer
  public onAudioData?: (sessionId: string, audioBuffer: Int16Array) => void;
  public onCallEnded?: (sessionId: string) => void;

  constructor(sipPort = 5060, rtpPortBase = 10000) {
    super();
    const cfg = getConfig();
    this.sipPort = sipPort;
    this.rtpPortBase = rtpPortBase;
    this.nextRtpPort = rtpPortBase;
    this.tlsPort = cfg.sipTlsPort || 5061;
    this.tlsEnabled = Boolean(cfg.sipTlsEnabled);
    this.srtpEnabled = Boolean(cfg.srtpEnabled);
    this.srtpProfile = cfg.srtpProfile || 'AES_CM_128_HMAC_SHA1_80';

    const webhookHost = this.extractHostFromUrl(cfg.webhookPublicUrl || '');
    const envSipPublicHost = (process.env.SIP_PUBLIC_HOST || '').trim();
    const envSipPublicIp = (process.env.SIP_PUBLIC_IP || '').trim();
    const envMediaPublicIp = (process.env.SIP_MEDIA_PUBLIC_IP || '').trim();

    this.sipAdvertisedHost = envSipPublicHost || envSipPublicIp || webhookHost;
    this.mediaAdvertisedIp = envMediaPublicIp || envSipPublicIp || (this.isIpv4(webhookHost) ? webhookHost : '');
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

      // ── TCP Server (for SIP over TCP) ─
      this.tcpServer = createServer((socket) => {
        const remoteAddr = socket.remoteAddress || '0.0.0.0';
        const remotePort = socket.remotePort || 0;
        console.log(`[SIP] TCP connection from ${remoteAddr}:${remotePort}`);

        let buffer = '';
        socket.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const extracted = this.extractCompleteSipMessages(buffer);
          for (const sipMessage of extracted.messages) {
            this.handleSipData(sipMessage, remoteAddr, remotePort, socket);
          }
          buffer = extracted.remainder;
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

      if (this.tlsEnabled) {
        const certPath = getConfig().sipTlsCertPath || '';
        const keyPath = getConfig().sipTlsKeyPath || '';
        if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          this.tlsServer = createTlsServer({
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
            requestCert: false,
            rejectUnauthorized: false,
          });
          this.tlsServer.on('secureConnection', (socket: TLSSocket) => {
            const remoteAddr = socket.remoteAddress || '0.0.0.0';
            const remotePort = socket.remotePort || 0;
            console.log(`[SIP] TLS connection from ${remoteAddr}:${remotePort}`);
            let buffer = '';
            socket.on('data', (chunk: Buffer) => {
              buffer += chunk.toString('utf-8');
              const extracted = this.extractCompleteSipMessages(buffer);
              for (const sipMessage of extracted.messages) {
                this.handleSipData(sipMessage, remoteAddr, remotePort, socket as unknown as import('node:net').Socket);
              }
              buffer = extracted.remainder;
            });
            socket.on('error', (err) => console.error(`[SIP] TLS socket error: ${err.message}`));
          });
          this.tlsServer.listen(this.tlsPort, '0.0.0.0', () => {
            emitInfo(`[SIP] TLS endpoint listening on port ${this.tlsPort}`);
          });
        } else {
          emitError('[SIP] TLS enabled but certificate/key files are missing. SIP/TLS listener skipped.');
        }
      }
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
    } else if (sipMsg.method === 'OPTIONS') {
      this.handleOptions(sipMsg, remoteAddr, remotePort, tcpSocket);
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
    this.tlsServer?.close();
  }

  async playText(sessionId: string, text: string): Promise<void> {
    const call = this.calls.get(sessionId);
    if (!call || !text.trim()) return;

    if (!call.mediaRemoteHost || !call.mediaRemotePort) {
      call.pendingSpeech = call.pendingSpeech || [];
      call.pendingSpeech.push(text);
      emitInfo(`[SIP] Queued prompt for ${sessionId} until media target is known`);
      return;
    }

    const cfg = getConfig();
    if (!cfg.speechKey || !cfg.speechRegion) {
      emitError('[SIP] Cannot synthesize speech: speechKey/speechRegion missing');
      return;
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(cfg.speechKey, cfg.speechRegion);
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm;
    speechConfig.speechSynthesisVoiceName = 'th-TH-PremwadeeNeural';

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    try {
      const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
        synthesizer.speakTextAsync(
          text,
          (value) => resolve(value),
          (message) => reject(new Error(message)),
        );
      });

      const audioBuffer = Buffer.from(result.audioData);
      if (!audioBuffer.length) {
        emitError('[SIP] TTS synthesis returned empty audio');
        return;
      }

      await this.sendRtpAudio(call, audioBuffer);
      emitInfo(`[SIP] Played TTS prompt for ${sessionId}`);
    } finally {
      synthesizer.close();
    }
  }

  private async sendRtpAudio(call: ActiveCall, pcm16Audio: Buffer): Promise<void> {
    const pcm16 = new Int16Array(pcm16Audio.buffer, pcm16Audio.byteOffset, Math.floor(pcm16Audio.byteLength / 2));
    const downsampled = new Int16Array(Math.floor(pcm16.length / 2));
    for (let i = 0, j = 0; i + 1 < pcm16.length; i += 2, j++) {
      downsampled[j] = pcm16[i];
    }

    const payloadBytes = new Uint8Array(downsampled.length);
    for (let i = 0; i < downsampled.length; i++) {
      payloadBytes[i] = this.linearToMuLaw(downsampled[i]);
    }

    const chunkSize = 160;
    const targetHost = call.mediaRemoteHost;
    const targetPort = call.mediaRemotePort;
    if (!targetHost || !targetPort) return;

    if (typeof call.rtpSeq !== 'number') call.rtpSeq = Math.floor(Math.random() * 0xffff);
    if (typeof call.rtpTimestamp !== 'number') call.rtpTimestamp = Math.floor(Math.random() * 0xffffffff);
    if (typeof call.rtpSsrc !== 'number') call.rtpSsrc = Math.floor(Math.random() * 0xffffffff);

    const rtpSocket = this.rtpSockets.get(call.sessionId);
    if (!rtpSocket) return;

    for (let offset = 0; offset < payloadBytes.length; offset += chunkSize) {
      const payload = Buffer.from(payloadBytes.subarray(offset, Math.min(offset + chunkSize, payloadBytes.length)));
      const packet = Buffer.alloc(12 + payload.length);
      packet[0] = 0x80;
      packet[1] = 0x00;
      call.rtpSeq = (call.rtpSeq + 1) & 0xffff;
      packet.writeUInt16BE(call.rtpSeq, 2);
      packet.writeUInt32BE(call.rtpTimestamp, 4);
      packet.writeUInt32BE(call.rtpSsrc, 8);
      payload.copy(packet, 12);

      let outboundPacket: Buffer = packet;
      if (call.srtpEncrypt) {
        try {
          outboundPacket = srtpProtect(call.srtpEncrypt, packet);
        } catch (err: any) {
          emitInfo(`[SIP] SRTP encrypt error: ${err.message} — sending plain RTP`);
        }
      }

      // Guard against sending on a closed socket after call ended
      if (!rtpSocket) return;

      await new Promise<void>((resolve, reject) => {
        rtpSocket.send(outboundPacket, targetPort, targetHost, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      call.rtpTimestamp = (call.rtpTimestamp + chunkSize) >>> 0;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  private linearToMuLaw(sample: number): number {
    const BIAS = 0x84;
    const CLIP = 32635;
    let sign = 0;
    if (sample < 0) {
      sign = 0x80;
      sample = -sample;
    }
    if (sample > CLIP) sample = CLIP;
    sample += BIAS;

    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
      // no-op
    }

    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
  }

  // ── Send SIP Transfer (Refer) ──────────────────────────────────
  sendTransfer(sessionId: string, targetSipUri: string): void {
    const call = this.calls.get(sessionId);
    if (!call) return;

    const transportParam = call.transport === 'udp' ? '' : `;transport=${call.transport}`;
    const contactHost = this.getAdvertisedSipHost();
    const contactPort = call.transport === 'tls' ? this.tlsPort : this.sipPort;
    const referTarget = targetSipUri.replace(/;transport=[^;>]+/iu, '').trim();
    const referRequestUri = call.remoteTargetUri || `sip:${call.caller}@${call.remoteAddr}:${call.remotePort}`;
    const fromHeader = call.localDialogUri || `<sip:${call.callee}@${contactHost}>;tag=${call.tag}`;
    const toHeader = call.remoteDialogUri || `<sip:${call.caller}@${call.remoteAddr}:${call.remotePort}>`;
    const viaBranch = `z9hG4bK${Date.now()}${Math.floor(Math.random() * 10000)}`;

    const referMsg = [
      `REFER ${referRequestUri} SIP/2.0`,
      `Via: SIP/2.0/${call.transport === 'tls' ? 'TLS' : call.transport.toUpperCase()} ${this.getLocalIp()}:${contactPort};branch=${viaBranch}`,
      'Max-Forwards: 70',
      `From: ${fromHeader}`,
      `To: ${toHeader}`,
      `Call-ID: ${call.callId}`,
      `CSeq: ${++call.seq} REFER`,
      `Refer-To: <${referTarget}>`,
      `Referred-By: <sip:bot@${contactHost}:${contactPort}${transportParam}>`,
      `Contact: <sip:bot@${contactHost}:${contactPort}${transportParam}>`,
      'Content-Length: 0',
      '',
      '',
    ].join('\r\n');

    const buf = Buffer.from(referMsg);
    if (call.tcpSocket && !call.tcpSocket.destroyed) {
      call.tcpSocket.write(buf);
    } else {
      this.sipSocket.send(buf, call.remotePort, call.remoteAddr);
    }
    emitTransfer(`[SIP] Sent REFER to ${referTarget}`);
  }

  // ── Send SIP BYE (hangup) ───────────────────────────────────────
  sendBye(sessionId: string, reason = 'Caller requested hangup'): void {
    const call = this.calls.get(sessionId);
    if (!call) return;

    const contactHost = this.getAdvertisedSipHost();
    const contactPort = call.transport === 'tls' ? this.tlsPort : this.sipPort;
    const transportParam = call.transport === 'udp' ? '' : `;transport=${call.transport}`;
    const requestUri = call.remoteTargetUri || `sip:${call.caller}@${call.remoteAddr}:${call.remotePort}`;
    const fromHeader = call.localDialogUri || `<sip:${call.callee}@${contactHost}>;tag=${call.tag}`;
    const toHeader = call.remoteDialogUri || `<sip:${call.caller}@${call.remoteAddr}:${call.remotePort}>`;
    const viaBranch = `z9hG4bK${Date.now()}${Math.floor(Math.random() * 10000)}`;

    const byeMsg = [
      `BYE ${requestUri} SIP/2.0`,
      `Via: SIP/2.0/${call.transport === 'tls' ? 'TLS' : call.transport.toUpperCase()} ${this.getLocalIp()}:${contactPort};branch=${viaBranch}`,
      'Max-Forwards: 70',
      `From: ${fromHeader}`,
      `To: ${toHeader}`,
      `Call-ID: ${call.callId}`,
      `CSeq: ${++call.seq} BYE`,
      `Contact: <sip:bot@${contactHost}:${contactPort}${transportParam}>`,
      `Reason: ${reason}`,
      'Content-Length: 0',
      '',
      '',
    ].join('\r\n');

    const buf = Buffer.from(byeMsg);
    if (call.tcpSocket && !call.tcpSocket.destroyed) {
      call.tcpSocket.write(buf);
    } else {
      this.sipSocket.send(buf, call.remotePort, call.remoteAddr);
    }

    emitInfo(`[SIP] Sent BYE for session ${sessionId}`);

    // Local cleanup right away to avoid dangling RTP/ASR resources.
    const rtpSock = this.rtpSockets.get(sessionId);
    if (rtpSock) { rtpSock.close(); this.rtpSockets.delete(sessionId); }
    this.calls.delete(sessionId);
    if (this.onCallEnded) this.onCallEnded(sessionId);
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

  private extractHostFromUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname;
    } catch {
      return '';
    }
  }

  private isIpv4(value: string): boolean {
    return /^(\d{1,3}\.){3}\d{1,3}$/u.test(value);
  }

  private isPrivateIpv4(ip: string): boolean {
    return /^10\./u.test(ip)
      || /^127\./u.test(ip)
      || /^192\.168\./u.test(ip)
      || /^172\.(1[6-9]|2\d|3[0-1])\./u.test(ip);
  }

  private getAdvertisedSipHost(): string {
    return this.sipAdvertisedHost || this.getLocalIp();
  }

  private getAdvertisedMediaIp(): string {
    const advertised = this.mediaAdvertisedIp || this.getLocalIp();
    if (this.isPrivateIpv4(advertised) && !this.warnedPrivateMediaIp) {
      emitError(`[SIP] Advertised media IP is private (${advertised}). Set SIP_MEDIA_PUBLIC_IP for SBC reachability.`);
      this.warnedPrivateMediaIp = true;
    }
    return advertised;
  }

  private getNextRtpPort(): number {
    const port = this.nextRtpPort;
    this.nextRtpPort += 2;
    return port;
  }

  private extractCompleteSipMessages(buffer: string): { messages: string[]; remainder: string } {
    const messages: string[] = [];
    let remainder = buffer;

    while (remainder.length > 0) {
      const crlfIndex = remainder.indexOf('\r\n\r\n');
      const lfIndex = remainder.indexOf('\n\n');
      let headerEnd = -1;
      let separatorLength = 0;

      if (crlfIndex >= 0 && (lfIndex < 0 || crlfIndex <= lfIndex)) {
        headerEnd = crlfIndex;
        separatorLength = 4;
      } else if (lfIndex >= 0) {
        headerEnd = lfIndex;
        separatorLength = 2;
      }

      if (headerEnd < 0) break;

      const headers = remainder.slice(0, headerEnd);
      const contentLengthMatch = headers.match(/^content-length\s*:\s*(\d+)$/imu);
      const contentLength = contentLengthMatch ? parseInt(contentLengthMatch[1], 10) : 0;
      const totalLength = headerEnd + separatorLength + contentLength;

      if (remainder.length < totalLength) break;

      messages.push(remainder.slice(0, totalLength));
      remainder = remainder.slice(totalLength);
    }

    return { messages, remainder };
  }

  private getAudioTransportProfile(sdpBody: string): string {
    const match = sdpBody.match(/^m=audio\s+\d+\s+([^\s]+)\s+/imu);
    return match?.[1]?.toUpperCase() || 'RTP/AVP';
  }

  private offerSupportsSdesSrtp(sdpBody: string): boolean {
    const transportProfile = this.getAudioTransportProfile(sdpBody);
    return /SAVP(F)?$/u.test(transportProfile) && /a=crypto:\d+\s+/iu.test(sdpBody);
  }

  private createSrtpCryptoLine(): string {
    const inlineKey = randomBytes(30).toString('base64');
    return `a=crypto:1 ${this.srtpProfile} inline:${inlineKey}`;
  }

  /**
   * Parse incoming a=crypto line and extract material for SRTP decrypt context.
   * Format: a=crypto:<tag> <suite> inline:<base64-key>|[lifetime]|[mki]
   * Returns masterKey (16B) and masterSalt (14B) from the 30-byte base64 inline value.
   */
  private parseCryptoInline(sdpBody: string): { masterKey: Buffer; masterSalt: Buffer } | null {
    const cryptoMatch = sdpBody.match(/^a=crypto:\d+\s+([^\s]+)\s+inline:([A-Za-z0-9+/=]+)/imu);
    if (!cryptoMatch) return null;

    const suite = cryptoMatch[1].toUpperCase();
    if (!suite.startsWith('AES_CM_128_HMAC_SHA1_80') && !suite.startsWith('AES_CM_128_HMAC_SHA1_32')) {
      emitInfo(`[SIP] Unsupported SRTP suite "${suite}" — falling back to plain RTP`);
      return null;
    }

    try {
      // Strip optional |lifetime and |mki_value:mki_length parameters after the base64 key
      const b64 = cryptoMatch[2].split('|')[0];
      const raw = Buffer.from(b64, 'base64');
      if (raw.length < 30) {
        emitInfo(`[SIP] SRTP crypto key too short (${raw.length}B), need 30B`);
        return null;
      }
      return { masterKey: raw.subarray(0, 16), masterSalt: raw.subarray(16, 30) };
    } catch {
      emitInfo('[SIP] Failed to decode SRTP crypto key');
      return null;
    }
  }

  /**
   * Build SRTP keying material for the SBC's offered key (decrypt side).
   */
  private buildDecryptMaterial(sdpBody: string): import('@agentdance/node-webrtc-srtp').SrtpKeyingMaterial | null {
    const parsed = this.parseCryptoInline(sdpBody);
    if (!parsed) return null;
    return {
      masterKey: parsed.masterKey,
      masterSalt: parsed.masterSalt,
      profile: ProtectionProfile.AES_128_CM_HMAC_SHA1_80,
    };
  }

  /**
   * Build SRTP keying material for our own fresh key (encrypt side).
   * The bot generates its own master key + salt so each direction has independent keys.
   */
  private buildEncryptMaterial(): { material: import('@agentdance/node-webrtc-srtp').SrtpKeyingMaterial; cryptoLine: string } {
    const masterKey = randomBytes(16);
    const masterSalt = randomBytes(14);
    const inlineKey = Buffer.concat([masterKey, masterSalt]).toString('base64');
    return {
      material: {
        masterKey,
        masterSalt,
        profile: ProtectionProfile.AES_128_CM_HMAC_SHA1_80,
      },
      cryptoLine: `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${inlineKey}`,
    };
  }

  private parseSipMessage(text: string): SipMessage {
    const lines = text.split('\r\n');
    const firstLine = lines[0] || '';
    const headers: Record<string, string> = {};
    let body = '';
    let inBody = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') { inBody = true; continue; }
      if (inBody) { body += `${lines[i]}\r\n`; continue; }
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

  private shouldSuppressIncomingMonitorLog(caller: string): boolean {
    return caller.trim() === '101';
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

    const via = (msg.headers.via || '').toUpperCase();
    const transport: ActiveCall['transport'] = tcpSocket
      ? (via.includes('SIP/2.0/TLS') ? 'tls' : 'tcp')
      : 'udp';
    // Extract SBC's real IP from Via header (for TCP calls)
    let sbcIp: string | undefined;
    if (tcpSocket) {
      const viaMatch = msg.headers.via?.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (viaMatch) sbcIp = viaMatch[1];
    }
    const remoteTargetUri = msg.headers.contact?.match(/<([^>]+)>/)?.[1]
      || `sip:${caller}@${remoteAddr}:${remotePort}`;
    const localDialogUri = `${to};tag=${tag}`;
    const remoteDialogUri = from;

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
      remoteTargetUri,
      localDialogUri,
      remoteDialogUri,
    };
    this.calls.set(sessionId, call);

    if (!this.shouldSuppressIncomingMonitorLog(caller)) {
      emitInfo(`[SIP] Incoming call from ${caller} to ${callee}`);
      emitCallEvent('call-started', sessionId, caller);
    }

    // Create RTP socket for receiving audio
    const rtpSocket = createSocket('udp4');
    this.rtpSockets.set(sessionId, rtpSocket);

    rtpSocket.on('message', (rtpData, rinfo) => {
      call.mediaRemoteHost = rinfo.address;
      call.mediaRemotePort = rinfo.port;

      if (call.pendingSpeech && call.pendingSpeech.length > 0) {
        const queued = [...call.pendingSpeech];
        call.pendingSpeech = [];
        for (const prompt of queued) {
          void this.playText(sessionId, prompt);
        }
      }

      // Decrypt SRTP if negotiated — drop packet on auth failure to avoid garbage audio
      let rawPacket: Buffer = rtpData;
      if (call.srtpDecrypt) {
        try {
          const decrypted = srtpUnprotect(call.srtpDecrypt, rtpData);
          if (decrypted) {
            rawPacket = Buffer.from(decrypted);
          } else {
            emitInfo(`[SIP] SRTP auth failure for ${sessionId} — dropping packet`);
            return;
          }
        } catch (err: any) {
          emitInfo(`[SIP] SRTP decrypt error for ${sessionId}: ${err.message} — dropping packet`);
          return;
        }
      }
      const packet = parseRtpPacket(rawPacket);
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

    // ── SRTP negotiation ─────────────────────────────────────────
    // Note: SRTP library (RFC 3711) currently has auth tag / replay window
    // mismatches with the SBC.  Always answer RTP/AVP until this is resolved.
    const offerBody = msg.body || '';
    const answerWithSrtp = false;

    const sdpMediaHost = this.getAdvertisedMediaIp();
    const sdpMediaPort = myPort;
    const mediaTransportProfile = 'RTP/AVP';
    const cryptoLine = '';
    const sdp = [
      'v=0',
      `o=- 0 0 IN IP4 ${sdpMediaHost}`,
      's=SBC Bot Media',
      `c=IN IP4 ${sdpMediaHost}`,
      't=0 0',
      `m=audio ${sdpMediaPort} ${mediaTransportProfile} 0`,
      'a=rtpmap:0 PCMU/8000',
      'a=sendrecv',
      cryptoLine,
    ].filter(Boolean).join('\r\n') + '\r\n';

    const contactHost = this.getAdvertisedSipHost();
    const contactPort = transport === 'tls' ? this.tlsPort : this.sipPort;
    const contactTransportParam = transport === 'udp' ? '' : `;transport=${transport}`;

    const response = [
      `SIP/2.0 200 OK`,
      `Via: ${msg.headers.via || ''}`,
      `From: ${from}`,
      `To: ${to};tag=${tag}`,
      `Call-ID: ${callId}`,
      `CSeq: ${msg.headers.cseq || '1 INVITE'}`,
      `Contact: <sip:bot@${contactHost}:${contactPort}${contactTransportParam}>`,
      `Content-Type: application/sdp`,
      `Content-Length: ${Buffer.byteLength(sdp)}`,
      '',
      sdp,
    ].join('\r\n');

    const responseBuf = Buffer.from(response);
    if (tcpSocket) {
      // Send via TCP
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

    const cfg = getConfig();
    if (cfg.welcomeMessage) {
      void this.playText(callId, cfg.welcomeMessage);
    }
  }

  private handleOptions(
    msg: SipMessage,
    remoteAddr: string,
    remotePort: number,
    tcpSocket?: import('node:net').Socket,
  ): void {
    const toHeader = msg.headers.to || '';
    const toWithTag = toHeader.includes('tag=') ? toHeader : `${toHeader};tag=bot-${Date.now()}`;

    const response = [
      'SIP/2.0 200 OK',
      `Via: ${msg.headers.via || ''}`,
      `From: ${msg.headers.from || ''}`,
      `To: ${toWithTag}`,
      `Call-ID: ${msg.headers['call-id'] || `opt-${Date.now()}`}`,
      `CSeq: ${msg.headers.cseq || '1 OPTIONS'}`,
      'Allow: REGISTER,OPTIONS,INVITE,ACK,CANCEL,BYE,NOTIFY,PRACK,REFER,INFO,SUBSCRIBE,UPDATE',
      'Accept: application/sdp, application/simple-message-summary, message/sipfrag',
      'Content-Length: 0',
      '',
      '',
    ].join('\r\n');

    const responseBuf = Buffer.from(response);
    if (tcpSocket && !tcpSocket.destroyed) {
      tcpSocket.write(responseBuf);
    } else {
      this.sipSocket.send(responseBuf, remotePort, remoteAddr);
    }

    emitInfo(`[SIP] Responded 200 OK to OPTIONS from ${remoteAddr}:${remotePort}`);
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
      '',
    ].join('\r\n');

    this.sipSocket.send(Buffer.from(response), this.sipPort, '127.0.0.1');
  }
}