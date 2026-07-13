import { EventEmitter } from 'node:events';

/* ── Log types ────────────────────────────────────────────────────── */

export type LogType = 'INFO' | 'AI' | 'ENTRA-ID' | 'TRANSFER' | 'ERROR';

export interface LogEntry {
  id: number;
  timestamp: string;
  type: LogType;
  message: string;
}

/* ── Alert types ──────────────────────────────────────────────────── */

export type AlertLevel = 'WARNING' | 'CRITICAL';

export interface SystemAlert {
  id: number;
  timestamp: string;
  level: AlertLevel;
  message: string;
}

/* ── Event emitter (singleton) ────────────────────────────────────── */

const systemEventEmitter = new EventEmitter();
systemEventEmitter.setMaxListeners(100);

const LOG_EVENT = 'system:log';
const ALERT_EVENT = 'system:alert';

let _counter = 0;

/**
 * Emit a log entry. All connected WebSocket clients will receive it.
 */
export function emitLog(type: LogType, message: string): LogEntry {
  const entry: LogEntry = {
    id: ++_counter,
    timestamp: new Date().toISOString(),
    type,
    message,
  };
  systemEventEmitter.emit(LOG_EVENT, entry);
  return entry;
}

/* ── Convenience helpers ──────────────────────────────────────────── */

export function emitInfo(message: string) { return emitLog('INFO', message); }
export function emitAi(message: string) { return emitLog('AI', message); }
export function emitEntraId(message: string) { return emitLog('ENTRA-ID', message); }
export function emitTransfer(message: string) { return emitLog('TRANSFER', message); }
export function emitError(message: string) { return emitLog('ERROR', message); }

/**
 * Broadcasts a real-time system alert to all connected Web UI clients.
 * Displayed as a top-bar banner on the frontend.
 */
export function broadcastSystemAlert(
  level: AlertLevel,
  message: string,
): SystemAlert {
  const alert: SystemAlert = {
    id: ++_counter,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  systemEventEmitter.emit(ALERT_EVENT, alert);
  console.warn(`[alert][${level}] ${message}`);
  return alert;
}

/* ── Call lifecycle event types ───────────────────────────────────── */

export interface CallEvent {
  type: 'call-started' | 'call-ended';
  conversationId: string;
  caller: string;
  timestamp: string;
}

const CALL_EVENT = 'system:call';

/**
 * Broadcasts a call lifecycle event (started / ended) to all connected
 * WebSocket clients so the Monitor dashboard can track active calls in
 * real time.
 */
export function emitCallEvent(
  eventType: 'call-started' | 'call-ended',
  conversationId: string,
  caller: string,
): CallEvent {
  const callEvent: CallEvent = {
    type: eventType,
    conversationId,
    caller,
    timestamp: new Date().toISOString(),
  };
  systemEventEmitter.emit(CALL_EVENT, callEvent);
  return callEvent;
}

export { systemEventEmitter, LOG_EVENT, ALERT_EVENT, CALL_EVENT };