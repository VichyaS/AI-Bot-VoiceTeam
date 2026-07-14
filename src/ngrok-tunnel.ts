/**
 * Tunnel Manager — สร้าง public tunnel สำหรับ SIP/RTP
 * 
 * รองรับ:
 * 1. Playit.gg (ฟรี, TCP, ไม่ต้องใช้บัตร) — auto-download binary
 * 2. ngrok HTTP (ฟรี, ไม่ต้องใช้บัตร, ต้องมี NGROK_AUTHTOKEN)
 * 
 * Environment:
 *   TUNNEL_TYPE    — "playit" (default), "ngrok", หรือ "auto"
 *   NGROK_AUTHTOKEN — (สำหรับ ngrok)
 *   SIP_PORT       — local SIP port (default 5060)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import { emitInfo, emitError } from './system-logger.js';

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl = '';
let tunnelPort = 0;

export interface TunnelInfo {
  url: string;
  port: number;
  type: 'playit' | 'ngrok';
}

/** ดาวน์โหลด Playit.gg Agent binary */
async function downloadPlayit(): Promise<string> {
  const p = '/tmp/playit';
  if (fs.existsSync(p)) return p;
  console.log('[tunnel] Downloading Playit.gg agent...');
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(p);
    const doGet = (url: string) => {
      https.get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          doGet(res.headers.location!);
          return;
        }
        res.pipe(f);
        f.on('finish', () => { f.close(); fs.chmodSync(p, 0o755); resolve(p); });
      }).on('error', reject);
    };
    doGet('https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64');
  });
}

/** เริ่ม Playit.gg tunnel (TCP, ฟรี) */
async function startPlayit(port: number): Promise<TunnelInfo> {
  const bin = await downloadPlayit();
  const secret = process.env.PLAYIT_SECRET || '';
  console.log(`[tunnel] Starting Playit.gg → localhost:${port}...`);

  return new Promise((resolve, reject) => {
    tunnelProcess = spawn(bin, secret ? ['--secret', secret, '--port', String(port)] : ['--port', String(port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let done = false;
    const onData = (text: string) => {
      process.stdout.write(text);
      const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.playit\.gg/);
      if (m && !done) { done = true; tunnelUrl = m[0]; tunnelPort = port; resolve({ url: tunnelUrl, port, type: 'playit' }); }
    };
    tunnelProcess!.stdout?.on('data', (d: Buffer) => onData(d.toString()));
    tunnelProcess!.stderr?.on('data', (d: Buffer) => onData(d.toString()));
    tunnelProcess!.on('error', (e) => { if (!done) reject(e); });
    tunnelProcess!.on('exit', (c) => { tunnelProcess = null; if (!done) reject(new Error(`exit code ${c}`)); });
    setTimeout(() => { if (!done) reject(new Error('Timeout')); }, 25000);
  });
}

/** เริ่ม ngrok HTTP tunnel (ฟรี) */
async function startNgrok(port: number): Promise<TunnelInfo> {
  const { default: ngrok } = await import('@ngrok/ngrok');
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) throw new Error('NGROK_AUTHTOKEN not set');
  console.log('[tunnel] Starting ngrok HTTP tunnel...');
  const t = await ngrok.connect({ addr: port, proto: 'http', authtoken: token });
  tunnelUrl = t.url() || '';
  tunnelPort = 443;
  return { url: tunnelUrl, port: 443, type: 'ngrok' };
}

/** เริ่ม tunnel */
export async function startTunnel(sipPort: number): Promise<TunnelInfo> {
  const type = process.env.TUNNEL_TYPE || 'auto';
  try {
    if (type === 'playit' || type === 'auto') return await startPlayit(sipPort);
  } catch (e: any) { console.log(`[tunnel] Playit failed: ${e.message}`); }
  return await startNgrok(sipPort);
}

export function stopTunnel(): void {
  tunnelProcess?.kill('SIGTERM');
  tunnelProcess = null;
}

export function getTunnelUrl(): string { return tunnelUrl; }