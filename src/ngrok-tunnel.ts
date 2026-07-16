/**
 * Tunnel Manager — ngrok TCP tunnel (ต้องมี credit card แต่ฟรี ไม่คิดเงิน)
 * 
 * Environment:
 *   NGROK_AUTHTOKEN   — ngrok auth token (required)
 *   NGROK_HTTP_DOMAIN — fixed ngrok domain for HTTP tunnel (e.g. gory-catty-duckbill.ngrok-free.dev)
 *   SIP_PORT          — local SIP port (default 5060)
 *   RTP_TCP_PORT      — local RTP-over-TCP port (default 5062)
 */

import { emitInfo, emitError } from './system-logger.js';

let tunnelUrl = '';
let tunnelPort = 0;
let httpTunnelUrl = '';
let rtpTunnelUrl = '';
let rtpTunnelPort = 0;

export interface TunnelInfo {
  url: string;
  port: number;
  type: 'ngrok';
}

export async function startTunnel(sipPort: number): Promise<TunnelInfo> {
  const { default: ngrok } = await import('@ngrok/ngrok');
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) throw new Error('NGROK_AUTHTOKEN not set');

  console.log('[tunnel] Starting ngrok TCP tunnel (credit card on file — no charge)...');
  const t = await ngrok.connect({ addr: sipPort, proto: 'tcp', authtoken: token });
  tunnelUrl = t.url() || '';
  const parsed = new URL(tunnelUrl);
  tunnelPort = parseInt(parsed.port, 10);

  console.log(`[tunnel] ✅ TCP tunnel: ${parsed.hostname}:${tunnelPort}`);
  console.log(`[tunnel] → SBC Proxy Set: Host=${parsed.hostname}, Port=${tunnelPort}, Transport=TCP`);
  console.log(`[tunnel] → Webhook URL: https://ai-bot-voiceteam.onrender.com/api/audiocodes/webhook`);

  // ── Start RTP-over-TCP tunnel (for media via ngrok) ───────────
  const rtpPort = parseInt(process.env.RTP_TCP_PORT || '5062', 10);
  try {
    console.log(`[tunnel] Starting ngrok RTP-TCP tunnel for port ${rtpPort}...`);
    const rtpT = await ngrok.connect({ addr: rtpPort, proto: 'tcp', authtoken: token });
    rtpTunnelUrl = rtpT.url() || '';
    const rtpParsed = new URL(rtpTunnelUrl);
    rtpTunnelPort = parseInt(rtpParsed.port, 10);
    console.log(`[tunnel] ✅ RTP-TCP tunnel: ${rtpParsed.hostname}:${rtpTunnelPort}`);
    emitInfo(`[tunnel] ✅ RTP-TCP tunnel: ${rtpParsed.hostname}:${rtpTunnelPort}`);
  } catch (err: any) {
    const msg = `[tunnel] ❌ RTP-TCP tunnel failed: ${err.message}`;
    console.log(msg);
    emitError(msg);
  }

  // ── Start HTTP tunnel for admin dashboard (if domain is set) ──
  const httpDomain = process.env.NGROK_HTTP_DOMAIN;
  if (httpDomain) {
    try {
      console.log(`[tunnel] Starting ngrok HTTP tunnel for admin dashboard on port 8080...`);
      const httpTunnel = await ngrok.connect({
        addr: 8080,
        proto: 'http',
        domain: httpDomain,
        authtoken: token,
      });
      httpTunnelUrl = httpTunnel.url() || '';
      console.log(`[tunnel] ✅ HTTP tunnel: ${httpTunnelUrl}`);
      console.log(`[tunnel] → Admin Dashboard: ${httpTunnelUrl}`);
      emitInfo(`[tunnel] ✅ HTTP tunnel: ${httpTunnelUrl}`);
    } catch (err: any) {
      const msg = `[tunnel] ❌ HTTP tunnel failed: ${err.message}`;
      console.log(msg);
      emitError(msg);
    }
  }

  return { url: tunnelUrl, port: tunnelPort, type: 'ngrok' };
}

export function stopTunnel(): void {}
export function getTunnelUrl(): string { return tunnelUrl; }
export function getTunnelPort(): number { return tunnelPort; }
export function getHttpTunnelUrl(): string { return httpTunnelUrl; }
export function getRtpTunnelUrl(): string { return rtpTunnelUrl; }
export function getRtpTunnelPort(): number { return rtpTunnelPort; }