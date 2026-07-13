import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LiveConsoleLog from '../components/LiveConsoleLog';
import AlertBanner from '../components/AlertBanner';

/* ── Icons ────────────────────────────────────────────────────────── */
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const PhoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
);
const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
);
const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
);
const ZapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
);
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
);

/* ── Types ────────────────────────────────────────────────────────── */
type CallStatus = 'greeting' | 'ai-processing' | 'ai-timeout' | 'searching-entra' | 'transferring';

interface ActiveCall {
  id: string;
  caller: string;
  status: CallStatus;
  durationSec: number;
  /** Track when AI processing started (for timeout detection) */
  aiProcessingStart?: number;
}

interface KpiData {
  activeCalls: number;
  totalCallsToday: number;
  avgDuration: string;
  apiLatencyMs: number;
}

const STATUS_LABELS: Record<CallStatus, string> = {
  'greeting': 'Greeting',
  'ai-processing': 'AI Processing',
  'ai-timeout': 'AI Timeout — Fallback routing triggered',
  'searching-entra': 'Searching Entra ID',
  'transferring': 'Transferring',
};

const STATUS_COLORS: Record<CallStatus, string> = {
  'greeting': 'bg-emerald-500',
  'ai-processing': 'bg-emerald-500',
  'ai-timeout': 'bg-red-500',
  'searching-entra': 'bg-emerald-500',
  'transferring': 'bg-amber-400',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── KPI Card ─────────────────────────────────────────────────────── */
function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}15`, color: accent }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ── Status Dot ───────────────────────────────────────────────────── */
function StatusDot({ status }: { status: CallStatus }) {
  return (
    <span className={`inline-block size-2.5 rounded-full ${STATUS_COLORS[status]} shadow-sm`} />
  );
}

/* ── Monitor Page ─────────────────────────────────────────────────── */
export default function MonitorPage() {
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();

  const [kpi, setKpi] = useState<KpiData>({
    activeCalls: 0,
    totalCallsToday: 0,
    avgDuration: '0:00',
    apiLatencyMs: 0,
  });

  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [criticalAlert, setCriticalAlert] = useState<string | null>(null);
  const criticalAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebSocket listener for real call lifecycle events ────────────
  const wsRef = useRef<WebSocket | null>(null);
  const wsTotalCallsRef = useRef(0);

  useEffect(() => {
    if (!token) return;

    // Use dynamic origin — works in dev (Vite proxy) and production (same origin)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/admin/ws/logs?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Call lifecycle events (sent from backend as { _call: ... })
        if (data._call) {
          const { type, conversationId, caller } = data._call;

          if (type === 'call-started') {
            setCalls((prev) => [
              ...prev,
              {
                id: conversationId,
                caller,
                status: 'greeting' as CallStatus,
                durationSec: 0,
              },
            ]);
            wsTotalCallsRef.current += 1;
            setKpi((prev) => ({
              ...prev,
              activeCalls: prev.activeCalls + 1,
              totalCallsToday: prev.totalCallsToday + 1,
            }));
          } else if (type === 'call-ended') {
            setCalls((prev) => prev.filter((c) => c.id !== conversationId));
            setKpi((prev) => ({
              ...prev,
              activeCalls: Math.max(0, prev.activeCalls - 1),
            }));
          }
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    return () => {
      ws.close(1000, 'Component unmount');
      wsRef.current = null;
    };
  }, [token]);

  // ── Duration ticker for active calls ─────────────────────────────
  useEffect(() => {
    if (calls.length === 0) return;
    const interval = setInterval(() => {
      setCalls((prev) =>
        prev.map((call) => ({ ...call, durationSec: call.durationSec + 1 })),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [calls.length]);

  // ── Force sync check ─────────────────────────────────────────────
  const forceSyncCheck = useCallback(async () => {
    if (!token) return;
    setSyncing(true);
    setCriticalAlert(null);
    try {
      const res = await fetch('/api/admin/config/test-route', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { latencyMs: number; success: boolean; openrouter: { success: boolean; errorMessage?: string }; azure: { success: boolean; errorMessage?: string } };
      setKpi((prev) => ({ ...prev, apiLatencyMs: data.latencyMs }));

      // Show critical alert if something failed
      if (!data.openrouter.success) {
        setCriticalAlert(`OpenRouter: ${data.openrouter.errorMessage || 'Connection failed'}`);
      } else if (!data.azure.success) {
        setCriticalAlert(`Azure AD: ${data.azure.errorMessage || 'Connection failed'}`);
      }

      if (criticalAlertTimeoutRef.current) clearTimeout(criticalAlertTimeoutRef.current);
      criticalAlertTimeoutRef.current = setTimeout(() => setCriticalAlert(null), 8000);
    } catch {
      setCriticalAlert('Force sync check failed — network error.');
    } finally {
      setSyncing(false);
    }
  }, [token]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (criticalAlertTimeoutRef.current) clearTimeout(criticalAlertTimeoutRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700" title="Back to Portal">
              <ArrowLeftIcon />
            </button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-sm">VT</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">AI Voice Bot Real-time Monitor</h1>
              <p className="text-xs text-gray-500">Live IVR &amp; voice processing</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:inline">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <LogoutIcon /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* System alerts banner */}
        <AlertBanner />

        {/* Critical sync alert banner */}
        {criticalAlert && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 shadow-sm animate-pulse">
            <span className="mt-0.5 shrink-0 text-red-500 text-lg">🔴</span>
            <p className="flex-1 text-sm font-medium text-red-700 leading-relaxed">{criticalAlert}</p>
            <button onClick={() => setCriticalAlert(null)} className="shrink-0 text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* KPI Stats Bar */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard icon={<PhoneIcon />} label="Active Calls" value={String(kpi.activeCalls)} accent="#059669" />
          <KpiCard icon={<ActivityIcon />} label="Total Calls Today" value={String(kpi.totalCallsToday)} accent="#4f46e5" />
          <KpiCard icon={<ClockIcon />} label="Average Call Duration" value={kpi.avgDuration} accent="#d97706" />
          <KpiCard icon={<ZapIcon />} label="OpenRouter API Latency" value={`${kpi.apiLatencyMs}ms`} accent="#dc2626" />
        </div>

        {/* Active Calls Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-sm font-semibold text-gray-800">Active Calls</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{calls.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={forceSyncCheck}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-60"
              >
                {syncing ? '⟳ Syncing…' : '⟳ Force Sync'}
              </button>
              <button
                onClick={() => setAutoRefresh((p) => !p)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  autoRefresh ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
              <RefreshIcon />
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Call ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Caller Number</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-medium text-gray-700">{call.id}</td>
                    <td className="px-5 py-3.5 text-gray-700">{call.caller}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <StatusDot status={call.status} />
                        <span className="text-gray-700">{STATUS_LABELS[call.status]}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-gray-500">{formatDuration(call.durationSec)}</td>
                  </tr>
                ))}
                {calls.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">No active calls.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Console Log */}
        <div className="mt-6">
          <LiveConsoleLog />
        </div>
      </main>
    </div>
  );
}