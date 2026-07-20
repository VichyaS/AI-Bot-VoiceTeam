import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfigApi } from '../hooks/useConfigApi';
import { useAuth } from '../contexts/AuthContext';
import FieldGroup from '../components/FieldGroup';
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

/* ── CSV helpers ──────────────────────────────────────────────────── */
type CsvImportResult = {
  count: number;
  mappings: Array<{
    name?: string;
    aliases?: string[];
    upn?: string;
    extension?: string;
    lineURI?: string;
    phone: string;
  }>;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else { quoted = !quoted; }
      continue;
    }
    if (char === ',' && !quoted) { values.push(current.trim()); current = ''; continue; }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseAliases(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[|;\/]/u).map((part) => part.trim()).filter(Boolean);
}

function buildFallbackMappingsFromCsv(csvText: string): CsvImportResult {
  const rows = csvText.split(/\r?\n/u).map((row) => row.trim()).filter(Boolean);
  if (rows.length === 0) return { count: 0, mappings: [] };
  const headers = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const mappings = rows.slice(1).map((row) => {
    const cells = parseCsvLine(row);
    const record: Record<string, string> = {};
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

/* ── Page ─────────────────────────────────────────────────────────── */
export default function FallbackMappingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { form, patch, saving, toast, dismissToast, handleSave } = useConfigApi();

  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  const applyCsvMappings = async (file: File) => {
    const csvText = await file.text();
    const result = buildFallbackMappingsFromCsv(csvText);
    patch({ fallbackMappings: result.mappings });
    setCsvFileName(file.name);
    setCsvStatus(`Loaded ${result.count} mapping${result.count === 1 ? '' : 's'} from CSV.`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700" title="Back to Portal">
              <ArrowLeftIcon />
            </button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600 text-white text-sm font-bold">FM</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Fallback Contact Mappings</h1>
              <p className="text-xs text-gray-500">Import CSV to map Thai or English names to phone numbers for transfer fallback</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <LogoutIcon /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Import section */}
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-800">Import Contact Mappings</h3>
              <p className="mt-1 text-sm text-gray-500">
                Upload a CSV file with columns: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">name</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">aliases</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">upn</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">extension</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">lineURI</code>, <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">phone</code>.
                Aliases can be separated by <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">|</code> or <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">;</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="data:text/csv;charset=utf-8,name,aliases,upn,extension,lineURI,phone%0Aวิชยะ,วิชญะ|vichya|vichaya,wichaya@company.com,1001,sip:1001@company.com,1001%0Aอุทัย,uthai,uthai@company.com,1002,sip:1002@company.com,tel:+6621234567"
                download="fallback-mappings-template.csv"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <DownloadIcon />
                Download template
              </a>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
                <UploadIcon />
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void applyCsvMappings(file);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            {csvFileName ? (
              <>
                <span className="font-medium text-amber-700">{csvFileName}</span>
                {csvStatus && <span className="text-gray-500">— {csvStatus}</span>}
              </>
            ) : (
              <span className="text-gray-400">No CSV imported yet.</span>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">
              Current Mappings
              <span className="ml-2 text-sm font-normal text-gray-400">({(form.fallbackMappings || []).length} entries)</span>
            </h3>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <LoaderIcon /> : <CheckIcon />}
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
          <textarea
            readOnly
            value={JSON.stringify(form.fallbackMappings || [], null, 2)}
            rows={12}
            className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 outline-none"
          />
        </div>
      </main>

      {toast && <Toast toast={toast} onClose={dismissToast} />}
    </div>
  );
}
