import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}

export default function ConfigTab({ icon, title, description, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 w-full ${
        active
          ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-500/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-gray-700'}`}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed line-clamp-2">
          {description}
        </p>
      </div>
    </button>
  );
}