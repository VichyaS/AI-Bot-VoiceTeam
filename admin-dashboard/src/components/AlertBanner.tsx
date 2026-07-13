import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

/* ── Types ────────────────────────────────────────────────────────── */

export interface SystemAlert {
  id: number;
  timestamp: string;
  level: 'WARNING' | 'CRITICAL';
  message: string;
}

/* ── WebSocket URL helper ─────────────────────────────────────────── */

function wsLogsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api/admin/ws/logs?token=${encodeURIComponent(token)}`;
}

/* ── Component ────────────────────────────────────────────────────── */

export default function AlertBanner() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket and listen for alert messages
  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(wsLogsUrl(token));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Alerts come wrapped in { _alert: { ... } }
        if (data._alert) {
          const alert = data._alert as SystemAlert;
          setAlerts((prev) => [...prev.slice(-20), alert]);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => {};

    return () => {
      // Only close if the connection is already open or in-flight — avoid calling close on CONNECTING
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [token]);

  const dismiss = (id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const dismissAll = () => setAlerts([]);

  if (alerts.length === 0) return null;

  const latest = alerts[alerts.length - 1];

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start justify-between gap-3 px-6 py-3 text-sm font-medium shadow-sm ${
            alert.level === 'CRITICAL'
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-amber-400 text-amber-900 animate-[pulse_2s_ease-in-out_infinite]'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="shrink-0 mt-0.5">
              {alert.level === 'CRITICAL' ? '🔴' : '⚠️'}
            </span>
            <span className="leading-relaxed">{alert.message}</span>
          </div>
          <button
            onClick={() => dismiss(alert.id)}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold opacity-70 hover:opacity-100"
            style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
          >
            ✕
          </button>
        </div>
      ))}
      {alerts.length > 1 && (
        <button
          onClick={dismissAll}
          className="ml-auto block rounded px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Dismiss all ({alerts.length})
        </button>
      )}
    </div>
  );
}