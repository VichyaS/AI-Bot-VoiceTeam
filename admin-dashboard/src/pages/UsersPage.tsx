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

interface UserEntry { username: string; role: string; expiryDate: string; status: string; }

function authHeaders(token: string) { return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }; }

export default function UsersPage() {
  const navigate = useNavigate(); const { token, user, logout } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]); const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<{ username: string; password: string; role: string; expiryDate: string; saving: boolean; editing: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders(token) });
      const data = await res.json() as { users: UserEntry[] };
      setUsers(data.users);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSave = async () => {
    if (!modal || !token) return;
    setModal({ ...modal, saving: true });
    try {
      const body: Record<string, string> = { username: modal.username, password: modal.password, role: modal.role };
      if (modal.expiryDate) body.expiryDate = modal.expiryDate;
      const res = await fetch('/api/admin/users', { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setToast({ message: data.error || 'Failed.', type: 'error' }); return; }
      setToast({ message: data.message || 'Created.', type: 'success' });
      setModal(null); fetchUsers();
    } catch { setToast({ message: 'Network error.', type: 'error' }); } finally { setModal(null); }
  };

  const handleDelete = async () => {
    if (!confirmDelete || !token) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(confirmDelete)}`, { method: 'DELETE', headers: authHeaders(token) });
      const data = await res.json();
      setToast({ message: data.message || 'Deleted.', type: 'success' });
      setConfirmDelete(null); fetchUsers();
    } catch { setToast({ message: 'Failed.', type: 'error' }); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"><ArrowLeftIcon /></button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600 text-sm font-bold text-white shadow-sm">UM</div>
            <div><h1 className="text-lg font-bold text-gray-900">User Management</h1><p className="text-xs text-gray-500">Manage admin accounts &amp; roles</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:inline">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"><LogoutIcon /> Logout</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading && <p className="text-sm text-gray-400">Loading users…</p>}
        {!loading && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">All Users ({users.length})</h2>
              <button onClick={() => setModal({ username: '', password: '', role: 'IVR_MANAGER', expiryDate: '', saving: false, editing: null })}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700">+ Add User</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.username} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3.5 font-medium text-gray-800">{u.username}</td>
                      <td className="px-5 py-3.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${u.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span></td>
                      <td className="px-5 py-3.5 text-gray-600">{u.expiryDate || '—'}</td>
                      <td className="px-5 py-3.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${u.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.status}</span></td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setConfirmDelete(u.username)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add User Modal */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Add New User</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-gray-600">Username</label><input type="text" value={modal.username} onChange={(e) => setModal({ ...modal, username: e.target.value })} placeholder="Enter username" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
              <div><label className="text-xs font-medium text-gray-600">Password</label><input type="password" value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} placeholder="Enter password" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
              <div><label className="text-xs font-medium text-gray-600">Role</label><select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"><option value="SUPER_ADMIN">SUPER_ADMIN</option><option value="IVR_MANAGER">IVR_MANAGER</option></select></div>
              <div><label className="text-xs font-medium text-gray-600">Account Expiry Date</label><input type="date" value={modal.expiryDate} onChange={(e) => setModal({ ...modal, expiryDate: e.target.value })} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30" /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={modal.saving} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60">{modal.saving ? 'Saving…' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-700">Delete user "{confirmDelete}"?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}