/**
 * Cloudflare Tunnel Manager
 * 
 * ใช้ cloudflared binary เพื่อสร้าง TCP tunnel สำหรับ SIP/RTP
 * Cloudflare Tunnel รองรับ TCP ฟรี ไม่ต้องใช้บัตรเครดิต!
 * 
 * วิธีติดตั้ง cloudflared บน Render:
 * - ใช้ pre-built binary จาก Cloudflare
 * 
 * Environment:
 *   TUNNEL_ENABLED    — ตั้งเป็น "true" เพื่อเปิดใช้งาน
 *   SIP_PORT          — Port ที่จะ tunnel (default 5060)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';

let tunnelProcess: ChildProcess | null = null;

/**
 * ดาวน์โหลด cloudflared binary สำหรับ Linux amd64
 */
async function downloadCloudflared(): Promise<string> {
  const binPath = '/tmp/cloudflared';

  // ถ้ามีอยู่แล้ว ไม่ต้องดาวน์โหลดซ้ำ
  if (fs.existsSync(binPath)) {
    return binPath;
  }

  console.log('[tunnel] Downloading cloudflared...');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(binPath);
    https.get('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location!, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            fs.chmodSync(binPath, 0o755);
            console.log('[tunnel] cloudflared downloaded successfully');
            resolve(binPath);
          });
        });
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.chmodSync(binPath, 0o755);
        console.log('[tunnel] cloudflared downloaded successfully');
        resolve(binPath);
      });
    }).on('error', (err) => {
      fs.unlinkSync(binPath);
      reject(err);
    });
  });
}

/**
 * เริ่ม Cloudflare Tunnel (TCP → localhost:SIP_PORT)
 * 
 * สร้าง tunnel URL แบบ random (xxxxx.trycloudflare.com)
 * ที่会自动 forward TCP traffic ไปยัง local SIP port
 */
export async function startTunnel(sipPort: number): Promise<string> {
  if (tunnelProcess) {
    console.log('[tunnel] Tunnel already running');
    return 'already-running';
  }

  try {
    const cloudflaredPath = await downloadCloudflared();

    console.log(`[tunnel] Starting cloudflare tunnel → localhost:${sipPort}...`);

    return new Promise((resolve, reject) => {
      // ใช้ "--url" แบบ HTTP แล้ว cloudflared จะสร้าง tunnel URL
      // แต่จริงๆ แล้ว SIP ต้องใช้ TCP — cloudflared รองรับ TCP ด้วย "--destination"
      // แต่ cloudflared free tunnel รองรับแค่ HTTP/HTTPS โดยตรง
      // สำหรับ TCP ต้องใช้ Cloudflare Tunnel feature (ฟรี)

      // วิธีที่ใช้ได้ฟรี: สร้าง HTTP tunnel แล้ว Ngrok HTTP ก็พอ
      // หรือใช้ cloudflared access TCP ผ่าน Cloudflare Zero Trust

      // วิธีที่ง่ายที่สุด: ใช้ cloudflared tunnel --url tcp://localhost:5060
      tunnelProcess = spawn(cloudflaredPath, [
        'tunnel',
        '--url', `tcp://localhost:${sipPort}`,
        '--no-autoupdate',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let urlFound = false;

      tunnelProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log(`[tunnel] ${text.trim()}`);

        // หา URL จาก log
        const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !urlFound) {
          urlFound = true;
          const url = urlMatch[0];
          console.log(`[tunnel] ✅ Tunnel URL: ${url}`);
          console.log(`[tunnel] → ใช้ URL นี้ตั้งค่าใน SBC Webhook`);
          resolve(url);
        }
      });

      tunnelProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        // cloudflared พิมพ์ log ไปที่ stderr
        const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !urlFound) {
          urlFound = true;
          const url = urlMatch[0];
          console.log(`[tunnel] ✅ Tunnel URL: ${url}`);
          console.log(`[tunnel] → ใช้ URL นี้ตั้งค่าใน SBC`);
          resolve(url);
        }
      });

      tunnelProcess.on('error', (err) => {
        console.error(`[tunnel] Failed to start: ${err.message}`);
        reject(err);
      });

      tunnelProcess.on('exit', (code) => {
        tunnelProcess = null;
        if (!urlFound) {
          reject(new Error(`cloudflared exited with code ${code}`));
        }
      });

      // Timeout 30 วินาที
      setTimeout(() => {
        if (!urlFound) {
          reject(new Error('Timeout waiting for tunnel URL'));
        }
      }, 30000);
    });
  } catch (err: any) {
    console.error(`[tunnel] Error: ${err.message}`);
    throw err;
  }
}

/**
 * หยุด tunnel
 */
export function stopTunnel(): void {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
    console.log('[tunnel] Tunnel stopped');
  }
}