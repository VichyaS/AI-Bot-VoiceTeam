import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type LogType = 'INFO' | 'AI' | 'ENTRA-ID' | 'TRANSFER' | 'ERROR';

export interface LogEntry {
  id: number;
  timestamp: string; // ISO-8601
  type: LogType;
  message: string;
}

/* ── Color map ────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<LogType, string> = {
  'INFO': 'text-cyan-300',
  'AI': 'text-purple-300',
  'ENTRA-ID': 'text-blue-300',
  'TRANSFER': 'text-emerald-300',
  'ERROR': 'text-red-400',
};

const TYPE_BADGE_COLORS: Record<LogType, string> = {
  'INFO': 'bg-cyan-700/60 text-cyan-200',
  'AI': 'bg-purple-700/60 text-purple-200',
  'ENTRA-ID': 'bg-blue-700/60 text-blue-200',
  'TRANSFER': 'bg-emerald-700/60 text-emerald-200',
  'ERROR': 'bg-red-700/60 text-red-200',
};

/* ── WebSocket URL helper ─────────────────────────────────────────── */

/**
 * Returns the WebSocket URL for the logs endpoint, with the JWT token
 * appended as a query parameter for authentication.
 */
function wsLogsUrl(token: string): string {
  // Use the same origin as the page (works in both dev and production)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/admin/ws/logs?token=${encodeURIComponent(token)}`;
}

/* ── Component ────────────────────────────────────────────────────── */

export default function LiveConsoleLog() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebSocket connection with auto-reconnect ─────────────────────
  const connect = useCallback(() => {
    if (!token) return;

    const wsUrl = wsLogsUrl(token);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Skip call lifecycle events and alerts (handled by MonitorPage)
        if (data._call || data._alert) return;
        const entry: LogEntry = data;
        setLogs((prev) => [...prev.slice(-200), entry]);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;

      // Clean up any stale reconnect timer before scheduling a new one
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Only auto-reconnect on unexpected closures (not a clean 1000 close)
      if (event.code !== 1000) {
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 3000);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this with a non-1000 code,
      // so the reconnect logic above handles it automatically.
    };
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        const ws = wsRef.current;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmount');
        }
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (!paused && !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, paused]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUp.current = !atBottom;
  }, []);

  const clearLogs = () => {
    setLogs([]);
    userScrolledUp.current = false;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return isNaN(date.getTime())
      ? '--:--:--'
      : date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-950 shadow-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className={`absolute inline-flex size-full rounded-full opacity-75 ${connected ? 'animate-ping bg-emerald-400' : reconnecting ? 'animate-spin bg-amber-400' : ''}`} />
            <span className={`relative inline-flex size-2 rounded-full ${connected ? 'bg-emerald-500' : reconnecting ? 'bg-amber-500' : 'bg-red-500'}`} />
          </span>
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Console Log</span>
          <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">{logs.length}</span>
          {!connected && !reconnecting && (
            <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] font-medium text-red-400">OFFLINE</span>
          )}
          {reconnecting && (
            <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 animate-pulse">RECONNECTING...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              paused
                ? 'bg-yellow-600/30 text-yellow-300 hover:bg-yellow-600/50'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="rounded bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-700"
          >
            ✕ Clear
          </button>
          <button
            onClick={() => {
              const text = logs.map(l => `[${formatTime(l.timestamp)}] [${l.type}] ${l.message}`).join('\n');
              const blob = new Blob([text], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `bot-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
              a.click(); URL.revokeObjectURL(url);
            }}
            className="rounded bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-700"
          >
            ⬇ Logs
          </button>
        </div>
      </div>

      {/* Log stream */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-72 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed scrollbar-thin"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
      >
        {logs.length === 0 && (
          <p className="text-gray-600 italic">No logs yet.</p>
        )}

        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 py-0.5 hover:bg-gray-900/40 rounded px-1 -mx-1">
            {/* Timestamp */}
            <span className="shrink-0 text-gray-600 select-none">{formatTime(log.timestamp)}</span>

            {/* Badge */}
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TYPE_BADGE_COLORS[log.type]}`}
            >
              {log.type}
            </span>

            {/* Message */}
            <span className={`${TYPE_COLORS[log.type]}`}>{log.message}</span>
          </div>
        ))}

        {/* Inline indicator when paused */}
        {paused && logs.length > 0 && (
          <div className="flex items-center gap-2 py-1 text-[11px] text-yellow-500/70">
            <span className="h-px flex-1 bg-yellow-600/20" />
            <span>Stream paused</span>
            <span className="h-px flex-1 bg-yellow-600/20" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}