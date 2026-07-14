/**
 * Tunnel Manager — สร้าง public tunnel via ngrok (HTTP, ฟรี)
 * 
 * Environment:
 *   NGROK_AUTHTOKEN — ngrok auth token (required)
 *   SIP_PORT       — local SIP port (default 5060)
 */

import { emitInfo, emitError } from './system-logger.js';

let tunnelUrl = '';

export interface TunnelInfo {
  url: string;
  port: number;
  type: 'ngrok';
}

export async function startTunnel(sipPort: number): Promise<TunnelInfo> {
  const { default: ngrok } = await import('@ngrok/ngrok');
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) throw new Error('NGROK_AUTHTOKEN not set');

  console.log('[tunnel] Starting ngrok HTTP tunnel (free)...');
  const t = await ngrok.connect({ addr: sipPort, proto: 'http', authtoken: token });
  tunnelUrl = t.url() || '';

  console.log(`[tunnel] ✅ ngrok tunnel: ${tunnelUrl}`);
  console.log(`[tunnel] → Voice.AI Connector URL: wss://${new URL(tunnelUrl).hostname}/api/audiocodes/bot-ws`);
  console.log(`[tunnel] → Webhook URL: ${tunnelUrl}/api/audiocodes/webhook`);

  return { url: tunnelUrl, port: 443, type: 'ngrok' };
}

export function stopTunnel(): void { /* ngrok cleans up on exit */ }
export function getTunnelUrl(): string { return tunnelUrl; }