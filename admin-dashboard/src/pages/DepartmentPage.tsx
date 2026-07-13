import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../hooks/useDepartments';
import Toast from '../components/Toast';
import type { DepartmentEntry } from '../types';

/* ── Icons ────────────────────────────────────────────────────────── */
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

/* ── Helpers ──────────────────────────────────────────────────────── */

function authHeaders(token: string) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function validateSipUri(v: string): boolean {
  return /^sip:.+@.+\..+$/i.test(v) || /^\d{2,}$/.test(v);
}

/* ── Department Form Modal ────────────────────────────────────────── */

interface DepartmentForm {
  name: string;
  nameEn: string;
  aliasesText: string;
  destType: 'sip' | 'extension';
  destValue: string;
}

const EMPTY_FORM: DepartmentForm = {
  name: '', nameEn: '', aliasesText: '', destType: 'sip', destValue: '',
};

function DeptFormModal({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: DepartmentForm;
  onChange: (f: DepartmentForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('Department name (TH) is required.');
  if (!form.destValue.trim()) errors.push('Destination value is required.');
  if (form.destType === 'sip' && form.destValue && !form.destValue.startsWith('sip:')) {
    errors.push('SIP URI must start with "sip:".');
  }
  if (form.destType === 'extension' && form.destValue && !/^\d+$/.test(form.destValue)) {
    errors.push('Extension must contain digits only.');
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">{form.name ? 'Edit Department' : 'Add New Department'}</h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department Name (TH) *</label>
              <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="ฝ่ายบัญชี" className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department Name (EN)</label>
              <input type="text" value={form.nameEn} onChange={(e) => onChange({ ...form, nameEn: e.target.value })}
                placeholder="Accounting" className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aliases / Synonyms</label>
            <textarea value={form.aliasesText} onChange={(e) => onChange({ ...form, aliasesText: e.target.value })}
              placeholder="ใส่คำพ้องเสียงคั่นด้วยเครื่องหมายจุลภาค ( , ) เช่น: การเงิน, บัญชี, คลัง, finance, billing" rows={2}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
            <p className="mt-1 text-[10px] text-gray-400">Comma-separated Thai/English keywords.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination Type</label>
              <select value={form.destType} onChange={(e) => onChange({ ...form, destType: e.target.value as 'sip' | 'extension' })}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30">
                <option value="sip">SIP URI</option>
                <option value="extension">Internal Extension</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination Value *</label>
              <input type="text" value={form.destValue} onChange={(e) => onChange({ ...form, destValue: e.target.value })}
                placeholder={form.destType === 'sip' ? 'sip:finance@company.com' : '102'}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>
          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onSave} disabled={saving || errors.length > 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Confirm Modal ────────────────────────────────────────────────── */

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-gray-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */

export default function DepartmentPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { departments, loading, addDepartment, updateDepartment, deleteDepartment } = useDepartments();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal state
  const [modal, setModal] = useState<{ form: DepartmentForm; editingIndex: number | null; saving: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const formToEntry = (f: DepartmentForm): DepartmentEntry => {
    const aliases = [f.name, f.nameEn, ...f.aliasesText.split(',').map((s) => s.trim()).filter(Boolean)];
    const uniqueAliases = [...new Set(aliases)];
    const sipUri = f.destType === 'sip' ? f.destValue : `sip:${f.destValue}@placeholder.domain`;
    return { name: f.name, sipUri, aliases: uniqueAliases };
  };

  const entryToForm = (e: DepartmentEntry): DepartmentForm => {
    const isExt = /^sip:(\d+)@/i.test(e.sipUri);
    return {
      name: e.name,
      nameEn: e.aliases.find((a) => /^[a-z]/i.test(a) && a !== e.name) || '',
      aliasesText: e.aliases.filter((a) => a !== e.name).join(', '),
      destType: isExt ? 'extension' : 'sip',
      destValue: isExt ? e.sipUri.replace(/^sip:(\d+)@.*$/i, '$1') : e.sipUri,
    };
  };

  const handleSaveModal = async () => {
    if (!modal) return;
    setModal({ ...modal, saving: true });
    const entry = formToEntry(modal.form);

    let result;
    if (modal.editingIndex !== null) {
      result = await updateDepartment(modal.editingIndex, entry);
    } else {
      result = await addDepartment(entry);
    }

    setModal(null);
    if (result.success) {
      setToast({ message: result.message || 'Saved successfully.', type: 'success' });
    } else {
      setToast({ message: result.error || 'Failed to save.', type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (confirmDelete === null) return;
    const result = await deleteDepartment(confirmDelete);
    setConfirmDelete(null);
    if (result.success) {
      setToast({ message: result.message || 'Deleted successfully.', type: 'success' });
    } else {
      setToast({ message: result.error || 'Failed to delete.', type: 'error' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"><ArrowLeftIcon /></button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">VT</div>
            <div><h1 className="text-lg font-bold text-gray-900">Department Management</h1><p className="text-xs text-gray-500">Manage IVR routing departments</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:inline">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><LogoutIcon /> Logout</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading && <p className="text-sm text-gray-400">Loading departments…</p>}

        {!loading && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">All Departments ({departments.length})</h2>
              <button onClick={() => setModal({ form: { ...EMPTY_FORM }, editingIndex: null, saving: false })}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">+ Add New Department</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Aliases</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {departments.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">No departments configured yet.</td></tr>
                  )}
                  {departments.map((dept, i) => {
                    const isExt = /^sip:(\d+)@/i.test(dept.sipUri);
                    const destLabel = isExt ? `Extension ${dept.sipUri.replace(/^sip:(\d+)@.*$/i, '$1')}` : dept.sipUri;
                    const enName = dept.aliases.find((a) => /^[a-z]/i.test(a) && a !== dept.name) || '';
                    return (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-gray-800">{dept.name}</span>
                        {enName && <span className="ml-1.5 text-gray-400">/ {enName}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {dept.aliases.slice(0, 5).map((a, j) => (
                            <span key={j} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{a}</span>
                          ))}
                          {dept.aliases.length > 5 && <span className="text-[10px] text-gray-400">+{dept.aliases.length - 5}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{destLabel}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModal({ form: entryToForm(dept), editingIndex: i, saving: false })}
                            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><EditIcon /></button>
                          <button onClick={() => setConfirmDelete(i)}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {modal && (
        <DeptFormModal form={modal.form} onChange={(f) => setModal({ ...modal, form: f })} onSave={handleSaveModal} onCancel={() => setModal(null)} saving={modal.saving} />
      )}
      {confirmDelete !== null && (
        <ConfirmModal message={`Are you sure you want to delete "${departments[confirmDelete]?.name}"?`} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}