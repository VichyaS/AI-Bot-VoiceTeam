import type { Toast } from '../hooks/useConfigApi';

interface Props {
  toast: Toast;
  onClose: () => void;
}

export default function Toast({ toast, onClose }: Props) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg text-sm font-medium transition-all ${
        toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">&times;</button>
    </div>
  );
}