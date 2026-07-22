import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';

/* ── Types ────────────────────────────────────────────────────────── */

interface UnhandledLogEntry {
  id: string;
  timestamp: string;
  userSpeech: string;
  rawAiResponse: unknown;
  status: 'pending_review' | 'resolved';
  resolutionNote?: string;
}

interface DepartmentEntry {
  name: string;
  sipUri: string;
  aliases: string[];
}

interface ToastData {
  message: string;
  type: 'success' | 'error';
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function authHeaders(token: string): Record<string, string> {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/* ── Component ────────────────────────────────────────────────────── */

export default function UnhandledSpeechReview() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<UnhandledLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [departments, setDepartments] = useState<DepartmentEntry[]>([]);

  // Dialog state
  const [dialog, setDialog] = useState<{
    log: UnhandledLogEntry;
    selectedDept: string;
    saving: boolean;
  } | null>(null);

  // Contact Mapping dialog state
  const [mappingDialog, setMappingDialog] = useState<{
    log: UnhandledLogEntry;
    name: string;
    phone: string;
    upn: string;
    extension: string;
    lineURI: string;
    saving: boolean;
    /** Index of selected existing mapping, -1 = new record */
    selectedMappingIdx: number;
  } | null>(null);
  const [existingMappings, setExistingMappings] = useState<Array<{name?: string; phone: string; upn?: string; aliases?: string[]}>>([]);

  // ── Fetch logs ──────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/unhandled-logs', { headers: authHeaders(token) });
      if (res.ok) {
        const data = await res.json() as { logs: UnhandledLogEntry[] };
        setLogs(data.logs.filter((l) => l.status === 'pending_review'));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token]);

  // ── Fetch departments from config ────────────────────────────────
  const fetchDepartments = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/config', { headers: authHeaders(token) });
      if (res.ok) {
        const cfg = await res.json() as { departments?: DepartmentEntry[] };
        setDepartments(cfg.departments ?? []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { fetchLogs(); fetchDepartments(); }, [fetchLogs, fetchDepartments]);

  // ── Fetch existing mappings for the dialog ───────────────────────
  const fetchMappings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/config', { headers: authHeaders(token) });
      if (res.ok) {
        const cfg = await res.json() as { fallbackMappings?: Array<{name?: string; phone: string; upn?: string}> };
        setExistingMappings(cfg.fallbackMappings || []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { if (mappingDialog) fetchMappings(); }, [mappingDialog, fetchMappings]);

  // ── Actions ──────────────────────────────────────────────────────
  const ignoreLog = async (log: UnhandledLogEntry) => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/unhandled-logs/resolve', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ id: log.id, note: 'ignored' }),
      });
      if (res.ok) {
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
        setToast({ message: 'Log entry ignored and resolved.', type: 'success' });
      }
    } catch {
      setToast({ message: 'Failed to resolve log entry.', type: 'error' });
    }
  };

  const handleAddAlias = async () => {
    if (!dialog || !token) return;
    const { log, selectedDept } = dialog;
    setDialog({ ...dialog, saving: true });

    try {
      // 1. Fetch current config
      const configRes = await fetch('/api/admin/config', { headers: authHeaders(token) });
      if (!configRes.ok) throw new Error('Failed to fetch config');
      const cfg = await configRes.json() as { departments?: DepartmentEntry[]; [key: string]: unknown };

      // 2. Build updated departments array with the new alias appended
      const depts = cfg.departments ?? [];
      const targetDept = depts.find((d) => d.name === selectedDept);
      if (!targetDept) throw new Error(`Department "${selectedDept}" not found`);

      // Extract the alias from userSpeech (use the raw text)
      const newAlias = log.userSpeech.trim().toLowerCase();
      if (!targetDept.aliases.includes(newAlias)) {
        targetDept.aliases.push(newAlias);
      }

      // 3. POST updated config
      const updateRes = await fetch('/api/admin/config', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ departments: depts }),
      });
      if (!updateRes.ok) throw new Error('Failed to update config');

      // 4. Resolve the log entry
      await fetch('/api/admin/unhandled-logs/resolve', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ id: log.id, note: `alias added to ${selectedDept}` }),
      });

      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      setDepartments(depts);
      setDialog(null);
      setToast({ message: 'System updated dynamically — alias added and log resolved.', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Operation failed.', type: 'error' });
      setDialog((prev) => prev ? { ...prev, saving: false } : null);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' });

  // ── Add to Contact Mappings ─────────────────────────────────────
  const handleAddToContactMappings = async () => {
    if (!mappingDialog || !token) return;
    const { log, name, phone, upn, extension, lineURI, selectedMappingIdx } = mappingDialog;
    setMappingDialog({ ...mappingDialog, saving: true });

    try {
      const configRes = await fetch('/api/admin/config', { headers: authHeaders(token) });
      if (!configRes.ok) throw new Error('Failed to fetch config');
      const cfg = await configRes.json() as { fallbackMappings?: any[] };

      const mappings = cfg.fallbackMappings || [];

      if (selectedMappingIdx >= 0 && selectedMappingIdx < mappings.length) {
        // ── Add alias to existing mapping ──
        const target = mappings[selectedMappingIdx];
        const newAlias = log.userSpeech.trim().toLowerCase();
        if (!target.aliases) target.aliases = [];
        if (!target.aliases.includes(newAlias)) {
          target.aliases.push(newAlias);
        }
      } else {
        // ── Create new record ──
        mappings.push({
          name: name.trim() || log.userSpeech.trim(),
          aliases: undefined,
          upn: upn.trim() || undefined,
          extension: extension.trim() || undefined,
          lineURI: lineURI.trim() || undefined,
          phone: phone.trim(),
        });
      }

      const updateRes = await fetch('/api/admin/config', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ fallbackMappings: mappings }),
      });
      if (!updateRes.ok) throw new Error('Failed to update config');

      await fetch('/api/admin/unhandled-logs/resolve', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ id: log.id, note: selectedMappingIdx >= 0 ? 'alias added to existing mapping' : 'added to contact mappings' }),
      });

      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      setMappingDialog(null);
      setToast({ message: selectedMappingIdx >= 0 ? 'Alias added to existing mapping and log resolved.' : 'Added to Contact Mappings and log resolved.', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Operation failed.', type: 'error' });
      setMappingDialog((prev) => prev ? { ...prev, saving: false } : null);
    }
  };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-2.5">
            <span className={`absolute inline-flex size-2.5 rounded-full ${logs.length > 0 ? 'animate-ping bg-amber-400 opacity-75' : ''}`} />
            <span className={`relative inline-flex size-2.5 rounded-full ${logs.length > 0 ? 'bg-amber-500' : 'bg-gray-300'}`} />
          </span>
          <h2 className="text-sm font-semibold text-gray-800">Unhandled Speech Review</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {loading ? '…' : logs.length}
          </span>
        </div>
        <button onClick={fetchLogs} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && logs.length === 0 && (
          <p className="text-sm text-gray-400 italic">No pending unhandled speech logs.</p>
        )}

        {!loading && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-800">&ldquo;{log.userSpeech}&rdquo;</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{formatTime(log.timestamp)} · {log.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDialog({ log, selectedDept: departments[0]?.name || '', saving: false })}
                    className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    + Add as Department Alias
                  </button>
                  <button
                    onClick={() => ignoreLog(log)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                  >
                    Ignore
                  </button>
                  <button
                    onClick={() => setMappingDialog({ log, name: log.userSpeech, phone: '', upn: '', extension: '', lineURI: '', saving: false, selectedMappingIdx: -1 })}
                    className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    + Add as Contact Mapping
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Alias Dialog ──────────────────────────────────────── */}
      {dialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-800">Add Department Alias</h3>
            <p className="mt-1 text-xs text-gray-500">
              Append &ldquo;<strong>{dialog.log.userSpeech}</strong>&rdquo; as an alias to:
            </p>

            {departments.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">No departments configured. Add departments in System Configuration first.</p>
            )}

            {departments.length > 0 && (
              <select
                value={dialog.selectedDept}
                onChange={(e) => setDialog((prev) => prev ? { ...prev, selectedDept: e.target.value } : null)}
                className="mt-3 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              >
                {departments.map((d) => (
                  <option key={d.name} value={d.name}>{d.name} ({d.sipUri})</option>
                ))}
              </select>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDialog(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAlias}
                disabled={dialog.saving || departments.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {dialog.saving ? 'Saving…' : 'Add Alias & Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to Contact Mappings Dialog ─────────────────────────── */}
      {mappingDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-800">Add to Contact Mappings</h3>
            <p className="mt-1 text-xs text-gray-500">Map &ldquo;<strong>{mappingDialog.log.userSpeech}</strong>&rdquo; to a phone number for fallback routing.</p>
            <div className="mt-3 space-y-3">
              {existingMappings.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Or select existing mapping to add alias</label>
                  <select onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    if (idx >= 0 && existingMappings[idx]) {
                      const m = existingMappings[idx];
                      setMappingDialog((prev) => prev ? { ...prev, name: m.name || prev.name, phone: m.phone, upn: m.upn || '', extension: '', lineURI: '', selectedMappingIdx: idx } : null);
                    } else {
                      setMappingDialog((prev) => prev ? { ...prev, selectedMappingIdx: -1 } : null);
                    }
                  }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30">
                    <option value="-1">— Select existing —</option>
                    {existingMappings.map((m, i) => (
                      <option key={i} value={i}>{m.name || m.upn || 'unnamed'} ({m.phone})</option>
                    ))}
                  </select>
                </div>
              )}
              <div><label className="text-xs font-medium text-gray-600">Name</label>
                <input type="text" value={mappingDialog.name} onChange={(e) => setMappingDialog({ ...mappingDialog, name: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
              <div><label className="text-xs font-medium text-gray-600">Phone *</label>
                <input type="text" value={mappingDialog.phone} onChange={(e) => setMappingDialog({ ...mappingDialog, phone: e.target.value })} placeholder="Required"
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600">UPN</label>
                  <input type="text" value={mappingDialog.upn} onChange={(e) => setMappingDialog({ ...mappingDialog, upn: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
                <div><label className="text-xs font-medium text-gray-600">Extension</label>
                  <input type="text" value={mappingDialog.extension} onChange={(e) => setMappingDialog({ ...mappingDialog, extension: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600">Line URI</label>
                <input type="text" value={mappingDialog.lineURI} onChange={(e) => setMappingDialog({ ...mappingDialog, lineURI: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setMappingDialog(null)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddToContactMappings} disabled={mappingDialog.saving || !mappingDialog.phone.trim()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60">
                {mappingDialog.saving ? 'Saving…' : 'Add to Mappings & Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          toast={{ message: toast.message, type: toast.type }}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}