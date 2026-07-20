import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfigApi } from '../hooks/useConfigApi';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';

/* ── Icons ────────────────────────────────────────────────────────── */
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const LoaderIcon = () => (
  <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

interface EntraUserResult {
  displayName: string; upn: string; mail: string; phone: string; lineURI: string; extension: string;
}
interface MappingRow {
  id: number; name: string; aliases: string; upn: string; extension: string; lineURI: string; phone: string;
}

export default function FallbackMappingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { form, patch, saving, toast, dismissToast } = useConfigApi();
  const [internalSaving, setInternalSaving] = useState(false);

  const [rows, setRows] = useState<MappingRow[]>(() => {
    const mappings = form.fallbackMappings || [];
    return mappings.map((m, i) => ({
      id: i, name: m.name || '', aliases: (m.aliases || []).join('|'),
      upn: m.upn || '', extension: m.extension || '', lineURI: m.lineURI || '', phone: m.phone || '',
    }));
  });
  const [nextId, setNextId] = useState(rows.length);
  const [domain, setDomain] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Sync rows from form.fallbackMappings when config loads from server
  useEffect(() => {
    if (initialized) return;
    const mappings = form.fallbackMappings || [];
    if (mappings.length > 0 || rows.length === 0) {
      const synced = mappings.map((m, i) => ({
        id: i, name: m.name || '', aliases: (m.aliases || []).join('|'),
        upn: m.upn || '', extension: m.extension || '', lineURI: m.lineURI || '', phone: m.phone || '',
      }));
      setRows(synced);
      setNextId(synced.length);
      setInitialized(true);
    }
  }, [form.fallbackMappings, initialized, rows.length]);

  const syncToForm = useCallback((updatedRows: MappingRow[]) => {
    const mappings = updatedRows.filter((r) => r.phone.trim()).map((r) => ({
      name: r.name.trim() || undefined,
      aliases: r.aliases.trim() ? r.aliases.split(/[|;\/]/u).map((a) => a.trim()).filter(Boolean) : undefined,
      upn: r.upn.trim() || undefined,
      extension: r.extension.trim() || undefined,
      lineURI: r.lineURI.trim() || undefined,
      phone: r.phone.trim(),
    }));
    patch({ fallbackMappings: mappings });
  }, [patch]);

  const updateRow = (id: number, field: keyof MappingRow, value: string) => {
    const updated = rows.map((r) => r.id === id ? { ...r, [field]: value } : r);
    setRows(updated); syncToForm(updated);
  };
  const deleteRow = (id: number) => {
    const updated = rows.filter((r) => r.id !== id);
    setRows(updated); syncToForm(updated);
  };
  const addRow = () => {
    const newRow: MappingRow = { id: nextId, name: '', aliases: '', upn: '', extension: '', lineURI: '', phone: '' };
    setNextId(nextId + 1);
    const updated = [...rows, newRow];
    setRows(updated); syncToForm(updated);
  };

  const applyCsvMappings = async (file: File) => {
    const csvText = await file.text();
    const result = buildFromCsv(csvText);
    const newRows = result.mappings.map((m, i) => ({
      id: nextId + i, name: m.name || '', aliases: (m.aliases || []).join('|'),
      upn: m.upn || '', extension: m.extension || '', lineURI: m.lineURI || '', phone: m.phone || '',
    }));
    setNextId(nextId + result.mappings.length);
    setRows(newRows); syncToForm(newRows);
    setCsvFileName(file.name);
    setCsvStatus(`Loaded ${result.count} mapping${result.count === 1 ? '' : 's'} from CSV.`);
  };

  const fetchFromEntra = async () => {
    setFetching(true); setFetchStatus(null);
    try {
      const token = localStorage.getItem('ac_bot_admin_token');
      const res = await fetch('/api/admin/entra-users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: searchFilter.trim() || undefined, domain: domain.trim() || undefined, top: 500 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { users: EntraUserResult[]; total: number };
      const newRows = data.users.map((u, i) => ({
        id: nextId + i, name: u.displayName, aliases: '', upn: u.upn,
        extension: u.extension, lineURI: u.lineURI, phone: u.phone || u.extension,
      }));
      setNextId(nextId + data.users.length);
      setRows(newRows); syncToForm(newRows);
      setFetchStatus(`Fetched ${data.total} user${data.total === 1 ? '' : 's'} from Entra ID.`);
    } catch (err: any) {
      setFetchStatus(`Fetch failed: ${err.message}`);
    } finally { setFetching(false); }
  };

  // Custom save that only sends fallbackMappings to avoid validation errors from other fields
  const handleSaveMappings = async () => {
    setInternalSaving(true);
    try {
      const token = localStorage.getItem('ac_bot_admin_token');
      const mappings = rows.filter((r) => r.phone.trim()).map((r) => ({
        name: r.name.trim() || undefined,
        aliases: r.aliases.trim() ? r.aliases.split(/[|;\/]/u).map((a) => a.trim()).filter(Boolean) : undefined,
        upn: r.upn.trim() || undefined,
        extension: r.extension.trim() || undefined,
        lineURI: r.lineURI.trim() || undefined,
        phone: r.phone.trim(),
      }));
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallbackMappings: mappings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.message) setFetchStatus(data.message);
    } catch (err: any) {
      setFetchStatus(`Save failed: ${err.message}`);
    } finally { setInternalSaving(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"><ArrowLeftIcon /></button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600 text-white text-sm font-bold">FM</div>
            <div><h1 className="text-lg font-bold text-gray-900">Fallback Contact Mappings</h1><p className="text-xs text-gray-500">Manage Thai/English name to phone mappings for transfer fallback</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><LogoutIcon /> Logout</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Fetch from Entra */}
        <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Fetch from Microsoft Entra ID</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600">Search filter (optional)</label>
              <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Start typing name or email..." className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-gray-600">Domain filter (optional)</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. company.com" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <button type="button" onClick={fetchFromEntra} disabled={fetching} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
              {fetching ? <LoaderIcon /> : <RefreshIcon />} {fetching ? 'Fetching…' : 'Fetch from Entra'}
            </button>
          </div>
          {fetchStatus && <p className="mt-2 text-sm text-blue-700">{fetchStatus}</p>}
        </div>
        {/* CSV Import */}
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-800">CSV Import / Export</h3>
              <p className="text-sm text-gray-500">Upload CSV or download template. Columns: name, aliases, upn, extension, lineURI, phone.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href="data:text/csv;charset=utf-8,name,aliases,upn,extension,lineURI,phone%0A%E0%B8%A7%E0%B8%B4%E0%B8%8A%E0%B8%A2%E0%B8%B0,%E0%B8%A7%E0%B8%B4%E0%B8%8A%E0%B8%8D%E0%B8%B0%7Cvichya%7Cvichaya,wichaya@company.com,1001,sip:1001@company.com,1001%0A%E0%B8%AD%E0%B8%B8%E0%B8%97%E0%B8%B1%E0%B8%A2,uthai,uthai@company.com,1002,sip:1002@company.com,tel:+6621234567"
                download="fallback-mappings-template.csv" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"><DownloadIcon /> Download template</a>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
                <UploadIcon /> Import CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void applyCsvMappings(f); }} />
              </label>
            </div>
          </div>
          {csvFileName && <p className="mt-2 text-sm text-amber-700">{csvFileName} — {csvStatus}</p>}
        </div>
        {/* Editable Table */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Mappings Table <span className="ml-2 text-sm font-normal text-gray-400">({rows.length} entries)</span></h3>
            <div className="flex items-center gap-3">
              <button type="button" onClick={addRow} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">+ Add Row</button>
              <button type="button" onClick={handleSaveMappings} disabled={internalSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
                {internalSaving ? <LoaderIcon /> : <CheckIcon />} {internalSaving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">DisplayName / Aliases</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">UPN</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Extension</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Line URI</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Phone</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <input type="text" value={row.name} onChange={(e) => updateRow(row.id, 'name', e.target.value)} placeholder="Display name" className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" />
                        <input type="text" value={row.aliases} onChange={(e) => updateRow(row.id, 'aliases', e.target.value)} placeholder="Aliases (pipe-separated)" className="block w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" />
                      </div>
                    </td>
                    <td className="px-3 py-2"><input type="text" value={row.upn} onChange={(e) => updateRow(row.id, 'upn', e.target.value)} placeholder="user@domain.com" className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" /></td>
                    <td className="px-3 py-2"><input type="text" value={row.extension} onChange={(e) => updateRow(row.id, 'extension', e.target.value)} placeholder="1001" className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" /></td>
                    <td className="px-3 py-2"><input type="text" value={row.lineURI} onChange={(e) => updateRow(row.id, 'lineURI', e.target.value)} placeholder="sip:1001@domain.com" className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" /></td>
                    <td className="px-3 py-2"><input type="text" value={row.phone} onChange={(e) => updateRow(row.id, 'phone', e.target.value)} placeholder="Required" className="block w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30" /></td>
                    <td className="px-3 py-2 text-right"><button onClick={() => deleteRow(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"><TrashIcon /> Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="py-8 text-center text-sm text-gray-400">No mappings yet. Fetch from Entra, import CSV, or add a row.</div>}
        </div>
      </main>
      {toast && <Toast toast={toast} onClose={dismissToast} />}
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else { quoted = !quoted; } continue; }
    if (char === ',' && !quoted) { values.push(current.trim()); current = ''; continue; }
    current += char;
  }
  values.push(current.trim()); return values;
}
function parseAliases(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[|;\/]/u).map((part) => part.trim()).filter(Boolean);
}
function buildFromCsv(csvText: string) {
  const rows = csvText.split(/\r?\n/u).map((row) => row.trim()).filter(Boolean);
  if (rows.length === 0) return { count: 0, mappings: [] };
  const headers = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const mappings = rows.slice(1).map((row) => {
    const cells = parseCsvLine(row); const record: Record<string, string> = {};
    headers.forEach((header, index) => { record[header] = cells[index] ?? ''; });
    return {
      name: record.name || record.displayname || record.display_name || '',
      aliases: parseAliases(record.aliases || record.alias || record.alt_names || record.alternates),
      upn: record.upn || record.username || record.user_name || '',
      extension: record.extension || record.ext || '',
      lineURI: record.lineuri || record.line_uri || '',
      phone: record.phone || record.phonenumber || record.phone_number || '',
    };
  }).filter((mapping) => mapping.phone.trim());
  return { count: mappings.length, mappings };
}
