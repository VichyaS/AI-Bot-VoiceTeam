import url from 'node:url';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { systemEventEmitter, LOG_EVENT, ALERT_EVENT, CALL_EVENT, type LogEntry, type SystemAlert, type CallEvent } from './system-logger.js';
import { getJwtSecret } from './auth-jwt.js';

const JWT_SECRET = getJwtSecret();

/**
 * Creates and returns a WebSocketServer attached to the provided HTTP server
 * on the path `/api/admin/ws/logs`.
 *
 * - Validates the JWT from the `token` query parameter during the initial HTTP
 *   upgrade handshake.  Uses `url.parse(req.url, true).query` to extract it and
 *   wraps `jwt.verify` in a try-catch block so missing, invalid, and expired
 *   tokens are all rejected with a specific `console.error` message.
 * - Listens for `system:log` events from the global systemEventEmitter and
 *   broadcasts each entry as JSON to all authenticated clients.
 */
export function createLogWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
  });

  // ── JWT authentication during upgrade ──────────────────────────────
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url || '').pathname;

    // Only intercept our WS path
    if (pathname !== '/api/admin/ws/logs') {
      return; // Let other paths fall through
    }

    // Extract token from query string (e.g. ?token=eyJ...)
    const query = url.parse(request.url || '', true).query;
    const token = query.token as string | undefined;

    if (!token) {
      console.error('[WS Auth Error] Connection refused — token query parameter is missing');
      socket.destroy();
      return;
    }

    if (!JWT_SECRET) {
      console.error('[WS Auth Error] Connection refused — JWT_SECRET is not configured');
      socket.destroy();
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        console.error('[WS Auth Error] Connection refused — token has expired');
      } else if (err.name === 'JsonWebTokenError') {
        console.error(`[WS Auth Error] Connection refused — invalid token (${err.message})`);
      } else {
        console.error(`[WS Auth Error] Connection refused — ${err.message || 'unknown error'}`);
      }
      socket.destroy();
      return;
    }

    // Authenticated — upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, payload);
    });
  });

  // ── Connection handler ─────────────────────────────────────────────
  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] Admin client connected');

    ws.on('close', () => {
      console.log('[ws] Admin client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err.message);
    });
  });

  // ── Broadcast log events to all connected clients ─────────────────
  systemEventEmitter.on(LOG_EVENT, (entry: LogEntry) => {
    const payload = JSON.stringify(entry);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  // ── Broadcast system alerts to all connected clients ──────────────
  systemEventEmitter.on(ALERT_EVENT, (alert: SystemAlert) => {
    const payload = JSON.stringify({ _alert: alert });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  // ── Broadcast call lifecycle events (started / ended) ───────────
  systemEventEmitter.on(CALL_EVENT, (callEvent: CallEvent) => {
    const payload = JSON.stringify({ _call: callEvent });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });

  return wss;
}