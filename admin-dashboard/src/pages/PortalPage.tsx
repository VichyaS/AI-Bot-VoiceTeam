import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/* ── Icons ────────────────────────────────────────────────────────── */
const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const ShieldCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 12 15 15 9" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
);

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

/* ── Card Component ───────────────────────────────────────────────── */
function PortalCard({
  icon,
  title,
  description,
  accent,
  onClick,
  externalUrl,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
  onClick: () => void;
  externalUrl?: string;
  disabled?: boolean;
}) {
  const borderStyle = disabled ? undefined : { borderColor: accent };
  const iconStyle = disabled ? undefined : { backgroundColor: `${accent}15`, color: accent };
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group relative flex flex-col w-full rounded-2xl border-2 p-6 text-center shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 h-full ${
        disabled
          ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-60'
          : 'bg-white hover:shadow-md'
      }`}
      style={borderStyle}
    >
      {/* External link icon */}
      {externalUrl && !disabled && (
        <span
          className="absolute top-3 right-3 z-10 cursor-pointer rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="Open in new tab"
          onClick={(e) => {
            e.stopPropagation();
            window.open(window.location.origin + externalUrl, '_blank', 'noopener,noreferrer');
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </span>
      )}
      {/* Hover accent strip */}
      {!disabled && (
        <div
          className="absolute inset-x-0 top-0 h-1.5 rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100"
          style={{ backgroundColor: accent }}
        />
      )}

      {/* Icon */}
      <div
        className={`mb-4 flex size-16 shrink-0 items-center justify-center rounded-2xl ${disabled ? 'text-gray-400' : ''}`}
        style={iconStyle}
      >
        {disabled ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : icon}
      </div>

      {/* Text */}
      <h3 className={`mb-2 text-lg font-bold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{title}</h3>

      {/* Description — flex-grow pushes CTA to bottom */}
      <p className={`flex-grow text-sm leading-relaxed ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>

      {/* CTA — always at bottom */}
      <div className="mt-auto pt-5">
        {disabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Super Admin Only
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all group-hover:brightness-110"
            style={{ backgroundColor: accent }}
          >
            Enter <ArrowRightIcon />
          </span>
        )}
      </div>
    </button>
  );
}

/* ── Portal Page ──────────────────────────────────────────────────── */
export default function PortalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isSuperAdmin } = useAuth();
  const [roleToast, setRoleToast] = useState<string | null>(null);

  // Show role error toast if redirected from a forbidden route
  useEffect(() => {
    const state = location.state as { roleError?: string } | null;
    if (state?.roleError) {
      setRoleToast(state.roleError);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-50 via-white to-indigo-50/40">
      {/* Role error toast */}
      {roleToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 shadow-lg">
          <span className="text-sm font-medium text-red-700">{roleToast}</span>
          <button onClick={() => setRoleToast(null)} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
              VT
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">VoiceTeam Bot Admin</h1>
              <p className="text-xs text-gray-500">Management Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:inline">{user?.username}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50"
            >
              <LogoutIcon /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 items-center justify-center px-6 lg:px-16 py-12">
        <div className="w-full max-w-7xl">
          {/* Tagline */}
          <div className="mb-12 text-center">
            <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide">Welcome back{user ? `, ${user.username}` : ''}</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">What would you like to do?</h2>
          </div>

          {/* Cards */}
          <div className="grid gap-4 xl:gap-6 grid-cols-5 items-stretch">
            <PortalCard
              icon={<SettingsIcon />}
              title="System Configuration"
              description="Manage API keys, system prompts, Entra ID credentials, and SIP routing parameters."
              accent="#4f46e5"
              onClick={() => navigate('/admin/config')}
              externalUrl="/admin/config"
              disabled={!isSuperAdmin}
            />
            <PortalCard
              icon={<ActivityIcon />}
              title="Live Bot Monitor"
              description="Monitor active IVR calls, system health, and view real-time voice processing logs."
              accent="#059669"
              onClick={() => navigate('/admin/monitor')}
              externalUrl="/admin/monitor"
            />
            <PortalCard
              icon={<UsersIcon />}
              title="Department Management"
              description="Add, edit, or delete IVR routing departments and their alias keywords."
              accent="#7c3aed"
              onClick={() => navigate('/admin/departments')}
              externalUrl="/admin/departments"
            />
            <PortalCard
              icon={<MessageSquareIcon />}
              title="Unhandled Speech"
              description="Review and resolve unrecognized IVR utterances by adding aliases or ignoring them."
              accent="#d97706"
              onClick={() => navigate('/admin/unhandled')}
              externalUrl="/admin/unhandled"
            />
            <PortalCard
              icon={<ShieldCheckIcon />}
              title="Fallback Mappings"
              description="Import CSV mappings for Thai/English names to phone numbers. Manage aliases for name resolution when Entra ID phone fields are incomplete."
              accent="#f59e0b"
              onClick={() => navigate('/admin/fallback-mappings')}
              externalUrl="/admin/fallback-mappings"
            />
            <PortalCard
              icon={<ShieldCheckIcon />}
              title="User Management"
              description="Create, modify, and delete admin users. Configure role assignments, update credentials, and manage account expiration periods."
              accent="#d97706"
              onClick={() => navigate('/admin/users')}
              externalUrl="/admin/users"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        VoiceTeam Bot Admin &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}