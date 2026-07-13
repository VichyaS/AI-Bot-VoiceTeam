import { useState, useEffect } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

export interface DebugResult {
  success: boolean;
  service: string;
  message?: string;
  debugLogs: string[];
  errorMessage: string | null;
}

interface Props {
  open: boolean;
  service: 'openrouter' | 'azure' | null;
  onClose: () => void;
  onRunTest: (service: 'openrouter' | 'azure') => Promise<DebugResult>;
}

const LoaderIcon = () => (
  <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ── Component ────────────────────────────────────────────────────── */

export default function ConnectionTestModal({ open, service, onClose, onRunTest }: Props) {
  const [result, setResult] = useState<DebugResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open || !service) return;
    setResult(null);
    setRunning(true);

    onRunTest(service).then((r) => {
      setResult(r);
      setRunning(false);
    });
  }, [open, service, onRunTest]);

  if (!open) return null;

  const serviceLabel = service === 'openrouter' ? 'OpenRouter' : 'Azure AD';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">Test Connection — {serviceLabel}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto px-5 py-4 font-mono text-[13px] leading-relaxed">
          {running && (
            <div className="flex items-center gap-2 text-gray-500">
              <LoaderIcon />
              <span>Running diagnostic tests...</span>
            </div>
          )}

          {!running && result && (
            <>
              {/* Error banner */}
              {result.errorMessage && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Error</p>
                  <p className="mt-1 text-sm font-medium text-red-600 leading-relaxed">{result.errorMessage}</p>
                </div>
              )}

              {/* Success banner */}
              {result.success && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-700">✅ {result.message}</p>
                </div>
              )}

              {/* Debug log stream */}
              <div className="space-y-1">
                {result.debugLogs.map((line, i) => {
                  const isError = line.startsWith('❌') || line.startsWith('💥');
                  const isSuccess = line.startsWith('✅');
                  const isStep = line.startsWith('🔧') || line.startsWith('📤') || line.startsWith('📡') || line.startsWith('🔑');
                  return (
                    <div
                      key={i}
                      className={`flex gap-2 ${
                        isError ? 'text-red-600' : isSuccess ? 'text-emerald-600' : isStep ? 'text-indigo-600' : 'text-gray-600'
                      }`}
                    >
                      <span className="shrink-0 w-5 text-center">{isError ? '✗' : isSuccess ? '✓' : '·'}</span>
                      <span className={isStep ? 'font-medium' : ''}>{line}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}