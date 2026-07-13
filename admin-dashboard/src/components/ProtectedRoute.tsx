import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/* ── Loading spinner ──────────────────────────────────────────────── */
const LoaderIcon = () => (
  <svg className="size-8 animate-spin text-indigo-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

interface Props {
  children: React.ReactNode;
  /** If set, only users with this role can access. Redirects to /portal on mismatch. */
  allowedRole?: 'SUPER_ADMIN' | 'IVR_MANAGER';
}

/**
 * Wraps a route that requires authentication.
 * Shows a loading spinner while initializing (reading token from localStorage).
 * If no valid token exists, redirects to /login.
 * If `allowedRole` is set and the user's role doesn't match,
 * redirects to /portal with a toast message in location state.
 */
export default function ProtectedRoute({ children, allowedRole }: Props) {
  const { isAuthenticated, role, initializing } = useAuth();
  const location = useLocation();

  // Wait for localStorage token to be read
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <LoaderIcon />
          <span className="text-sm text-gray-500">Authenticating…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRole && role !== allowedRole) {
    return (
      <Navigate
        to="/portal"
        state={{
          from: location.pathname,
          roleError: 'เข้าสู่ระบบล้มเหลว: พื้นที่นี้สงวนสิทธิ์สำหรับ Super Admin เท่านั้น',
        }}
        replace
      />
    );
  }

  return <>{children}</>;
}