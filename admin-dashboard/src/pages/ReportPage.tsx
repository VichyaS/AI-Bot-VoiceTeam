import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const LoaderIcon = () => (
  <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);

interface CallStats {
  totalCalls: number;
  totalMinutes: number;
  avgDurationSec: number;
  completedCalls: number;
  failedCalls: number;
  transferredCalls: number;
  dailyStats: { date: string; calls: number; minutes: number }[];
  monthlyStats: { month: string; calls: number; minutes: number }[];
  recentCalls: any[];
}

export default function ReportPage() {
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(365);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const t = token || localStorage.getItem('ac_bot_admin_token');
      const res = await fetch(`/api/admin/call-stats?days=${days}`, { headers: { 'Authorization': `Bearer ${t}` } });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [days, token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const downloadCsv = () => {
    const t = token || localStorage.getItem('ac_bot_admin_token');
    const a = document.createElement('a');
    a.href = `/api/admin/call-stats/csv?days=${days}`;
    a.setAttribute('download', `call-history-${new Date().toISOString().slice(0, 10)}.csv`);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setToast({ message: 'Downloading CSV...', type: 'success' });
  };

  const formatNumber = (n: number) => n.toLocaleString();
  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"><ArrowLeftIcon /></button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white text-sm font-bold">RP</div>
            <div><h1 className="text-lg font-bold text-gray-900">Call Report Dashboard</h1><p className="text-xs text-gray-500">IVR usage statistics &amp; call history</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><LogoutIcon /> Logout</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Period:</label>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30">
              <option value={0.0035}>Last 5 min</option>
              <option value={0.042}>Last 1 hour</option>
              <option value={0.25}>Last 6 hours</option>
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 3 months</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last 12 months</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchStats} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">↻ Refresh</button>
            <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"><DownloadIcon /> Download CSV</button>
          </div>
        </div>

        {loading && <div className="flex justify-center py-12"><LoaderIcon /><span className="ml-3 text-sm text-gray-500">Loading...</span></div>}

        {stats && !loading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalCalls)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Calls</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-emerald-600">{formatNumber(stats.totalMinutes)}</p>
                <p className="text-xs text-gray-500 mt-1">Total Minutes</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-lg font-bold text-gray-900">{formatDuration(stats.avgDurationSec)}</p>
                <p className="text-xs text-gray-500 mt-1">Avg Duration</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-blue-600">{formatNumber(stats.completedCalls)}</p>
                <p className="text-xs text-gray-500 mt-1">Completed</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-amber-600">{formatNumber(stats.transferredCalls)}</p>
                <p className="text-xs text-gray-500 mt-1">Transferred</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-red-600">{formatNumber(stats.failedCalls)}</p>
                <p className="text-xs text-gray-500 mt-1">Failed</p>
              </div>
            </div>

            {/* Monthly Stats */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-800 mb-3">Monthly Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Month</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Calls</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Minutes</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.monthlyStats.map((m) => (
                      <tr key={m.month} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{m.month}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{formatNumber(m.calls)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{formatNumber(m.minutes)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {m.calls > 0 ? formatDuration(Math.round((m.minutes * 60) / m.calls)) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Stats */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-800 mb-3">Daily Summary</h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Calls</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Minutes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.dailyStats.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 font-medium text-gray-800">{d.date}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatNumber(d.calls)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatNumber(d.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Calls */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-800 mb-3">Recent Calls (last 50)</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Caller</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Target</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.recentCalls.map((c, i) => (
                      <tr key={c.callId || i} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-xs text-gray-500">{new Date(c.startTime).toLocaleString('th-TH')}</td>
                        <td className="px-4 py-2 font-medium text-gray-800">{c.caller}</td>
                        <td className="px-4 py-2 text-gray-600">{c.targetValue || c.callee || '-'}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{c.durationSec ? formatDuration(c.durationSec) : '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            c.status === 'transferred' ? 'bg-blue-100 text-blue-700' :
                            c.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}