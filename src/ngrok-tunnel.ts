/**
 * Ngrok Tunnel Manager
 * 
 * Creates a TCP tunnel for SIP (UDP:5060) via ngrok so the SBC
 * can reach the Bot's SIP/RTP endpoint on Render (which doesn't
 * support UDP ingress).
 * 
 * Environment variables:
 *   NGROK_AUTHTOKEN  — ngrok auth token (required)
 *   SIP_PORT         — local SIP port (default 5060)
 */

import * as ngrok from '@ngrok/ngrok';
import { emitInfo, emitError } from './system-logger.js';

let tunnel: any = null;
let currentUrl = '';

export interface NgrokTunnelInfo {
  url: string;
  port: number;
}

/**
 * Starts an ngrok tunnel for the SIP port.
 * TCP is preferred but requires a card on free tier.
 * HTTP tunnel can be used as a workaround for testing.
 * @returns The public ngrok URL and port.
 */
export async function startNgrokTunnel(sipPort: number): Promise<NgrokTunnelInfo> {
  const authToken = process.env.NGROK_AUTHTOKEN;
  const tunnelType = process.env.NGROK_TUNNEL_TYPE || 'tcp'; // 'tcp' or 'http'

  if (!authToken) {
    console.log('[ngrok] NGROK_AUTHTOKEN environment variable is not set');
    emitError('[ngrok] NGROK_AUTHTOKEN environment variable is not set');
    throw new Error('NGROK_AUTHTOKEN not configured');
  }

  console.log(`[ngrok] Starting ${tunnelType} tunnel for SIP port ${sipPort}...`);
  emitInfo(`[ngrok] Starting ${tunnelType} tunnel for SIP port ${sipPort}...`);

  try {
    const config: any = {
      addr: sipPort,
      proto: tunnelType as 'tcp' | 'http',
      authtoken: authToken,
    };

    // For HTTP tunnel, add auth to protect the endpoint
    if (tunnelType === 'http') {
      config.basic_auth = [`bot:${authToken.slice(0, 8)}`];
    }

    tunnel = await ngrok.connect(config);

    const url = tunnel.url();
    const parsed = new URL(url);
    const port = parseInt(parsed.port, 10) || (tunnelType === 'http' ? 443 : 0);
    const hostname = parsed.hostname;

    currentUrl = url;

    if (tunnelType === 'tcp') {
      console.log(`[ngrok] ✅ TCP tunnel established: ${hostname}:${port}`);
      console.log(`[ngrok] → SBC Proxy Set: Host=${hostname}, Port=${port}, Transport=TCP`);
      emitInfo(`[ngrok] ✅ TCP tunnel established: ${hostname}:${port}`);
      emitInfo(`[ngrok] → SBC Proxy Set: Host=${hostname}, Port=${port}, Transport=TCP`);
    } else {
      console.log(`[ngrok] ✅ HTTP tunnel established: ${url}`);
      console.log(`[ngrok] → Bot can be reached at this URL for webhook + WS`);
      emitInfo(`[ngrok] ✅ HTTP tunnel established: ${url}`);
      emitInfo(`[ngrok] → Bot can be reached at this URL`);
    }

    return { url, port };
  } catch (err: any) {
    const msg = `[ngrok] Failed to create tunnel: ${err.message}`;
    console.log(msg);
    emitError(msg);
    throw err;
  }
}

/**
 * Stops the ngrok tunnel.
 */
export async function stopNgrokTunnel(): Promise<void> {
  if (tunnel) {
    try {
      await ngrok.disconnect(tunnel);
      tunnel = null;
      currentUrl = '';
      emitInfo('[ngrok] Tunnel disconnected');
    } catch (err: any) {
      emitError(`[ngrok] Error disconnecting: ${err.message}`);
    }
  }
}

/**
 * Returns the current ngrok tunnel URL, or null.
 */
export function getNgrokUrl(): string | null {
  return currentUrl || null;
}