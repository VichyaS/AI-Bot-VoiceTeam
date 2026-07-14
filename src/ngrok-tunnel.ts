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
 * Starts an ngrok TCP tunnel for the SIP port.
 * @returns The public ngrok URL and port.
 */
export async function startNgrokTunnel(sipPort: number): Promise<NgrokTunnelInfo> {
  const authToken = process.env.NGROK_AUTHTOKEN;

  if (!authToken) {
    console.log('[ngrok] NGROK_AUTHTOKEN environment variable is not set');
    emitError('[ngrok] NGROK_AUTHTOKEN environment variable is not set');
    throw new Error('NGROK_AUTHTOKEN not configured');
  }

  console.log(`[ngrok] Starting TCP tunnel for SIP port ${sipPort}...`);
  emitInfo(`[ngrok] Starting TCP tunnel for SIP port ${sipPort}...`);

  try {
    // Create TCP tunnel
    tunnel = await ngrok.connect({
      addr: sipPort,
      proto: 'tcp',
      authtoken: authToken,
    });

    // Parse URL (format: tcp://0.tcp.ngrok.io:12345)
    const url = tunnel.url();
    const parsed = new URL(url);
    const port = parseInt(parsed.port, 10);
    const hostname = parsed.hostname;

    currentUrl = url;
    console.log(`[ngrok] ✅ TCP tunnel established: ${hostname}:${port}`);
    console.log(`[ngrok] → SBC Proxy Set: Host=${hostname}, Port=${port}, Transport=TCP`);
    emitInfo(`[ngrok] ✅ TCP tunnel established: ${hostname}:${port}`);
    emitInfo(`[ngrok] → SBC Proxy Set: Host=${hostname}, Port=${port}, Transport=TCP`);

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