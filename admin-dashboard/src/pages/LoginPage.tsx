import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MfaLoginButton from '../components/MfaLoginButton';

const LoaderIcon = () => (
  <svg className="size-5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect to portal
  if (isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    const err = await login(username.trim(), password);
    if (!err) {
      navigate('/portal', { replace: true });
    } else {
      setError(err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-md">
            VT
          </div>
          <h1 className="text-xl font-bold text-gray-900">VoiceTeam Bot Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to manage your configuration</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoFocus
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading && <LoaderIcon />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs font-medium text-gray-400">OR</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* MFA Login */}
          <MfaLoginButton
            onMfaSuccess={(token, user) => {
              // Use the AuthContext login-equivalent mechanism
              // The token is already stored by the parent
              localStorage.setItem('ac_bot_admin_token', token);
              localStorage.setItem('ac_bot_admin_user', JSON.stringify(user));
              window.location.href = '/portal';
            }}
          />        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Contact your administrator if you have trouble signing in.
        </p>
      </div>
    </div>
  );
}