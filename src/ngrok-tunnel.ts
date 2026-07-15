/**
 * Tunnel Manager — ngrok TCP tunnel (ต้องมี credit card แต่ฟรี ไม่คิดเงิน)
 * 
 * Environment:
 *   NGROK_AUTHTOKEN — ngrok auth token (required)
 *   SIP_PORT       — local SIP port (default 5060)
 */

import { emitInfo, emitError } from './system-logger.js';

let tunnelUrl = '';
let tunnelPort = 0;

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

  return { url: tunnelUrl, port: tunnelPort, type: 'ngrok' };
}

export function stopTunnel(): void {}
export function getTunnelUrl(): string { return tunnelUrl; }
export function getTunnelPort(): number { return tunnelPort; }