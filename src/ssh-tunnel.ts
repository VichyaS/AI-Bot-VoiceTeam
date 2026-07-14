/**
 * SSH Tunnel Manager
 * 
 * ใช้ SSH reverse tunnel (serveo.net หรือ类似的 service)
 * เพื่อ expose SIP/RTP port ผ่าน public URL
 * 
 * ฟรี ไม่ต้องลงทะเบียน ไม่ต้องใช้บัตร!
 * 
 * วิธีใช้:
 *   ssh -R 80:localhost:5060 serveo.net
 * 
 * Environment:
 *   TUNNEL_ENABLED  — "true" หรือ "serveo"
 *   SIP_PORT        — local SIP port (default 5060)
 */

import { spawn, type ChildProcess } from 'node:child_process';

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl = '';

/**
 * เริ่ม SSH reverse tunnel ไปยัง serveo.net
 * ได้ URL เช่น https://abc123.serveo.net
 */
export async function startSshTunnel(localPort: number): Promise<string> {
  if (tunnelProcess) {
    return tunnelUrl;
  }

  console.log(`[tunnel] Starting SSH tunnel → localhost:${localPort} via serveo.net...`);

  return new Promise((resolve, reject) => {
    // SSH reverse tunnel: remote port → localhost:SIP_PORT
    tunnelProcess = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', `80:localhost:${localPort}`,
      'serveo.net',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    tunnelProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(`[tunnel] ${text}`);

      // serveo prints: Forwarding HTTP traffic from https://xxxx.serveo.net
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.serveo\.net/);
      if (match && !resolved) {
        resolved = true;
        tunnelUrl = match[0];
        console.log(`[tunnel] ✅ Public URL: ${tunnelUrl}`);
        console.log(`[tunnel] → Set this as SBC Webhook URL`);
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(`[tunnel] ${text}`);

      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.serveo\.net/);
      if (match && !resolved) {
        resolved = true;
        tunnelUrl = match[0];
        console.log(`[tunnel] ✅ Public URL: ${tunnelUrl}`);
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.on('error', (err) => {
      console.error(`[tunnel] SSH failed: ${err.message}`);
      if (!resolved) reject(err);
    });

    tunnelProcess.on('exit', (code) => {
      tunnelProcess = null;
      if (!resolved && code !== 0) {
        reject(new Error(`SSH exited with code ${code}`));
      }
    });

    // Timeout 15 วินาที
    setTimeout(() => {
      if (!resolved) {
        reject(new Error('Timeout: serveo.net did not respond (maybe blocked?)'));
      }
    }, 15000);
  });
}

/**
 * หยุด tunnel
 */
export function stopSshTunnel(): void {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
    tunnelUrl = '';
    console.log('[tunnel] SSH tunnel stopped');
  }
}

/**
 * คืนค่า URL ปัจจุบัน
 */
export function getTunnelUrl(): string {
  return tunnelUrl;
}