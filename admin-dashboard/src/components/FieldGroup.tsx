import type { ReactNode } from 'react';

interface Props {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export default function FieldGroup({ label, hint, error, children }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {hint && (
          <span
            title={hint}
            className="inline-flex size-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 cursor-help"
          >
            ?
          </span>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}