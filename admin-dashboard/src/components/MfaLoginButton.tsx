import { useState, useRef } from 'react';
import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

interface Props {
  onMfaSuccess: (token: string, user: { username: string; role: string }) => void;
}

const LoaderIcon = () => (
  <svg className="size-5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default function MfaLoginButton({ onMfaSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcaRef = useRef<PublicClientApplication | null>(null);

  const handleMfaLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch config to get MSAL settings
      const configRes = await fetch('/api/admin/config');
      if (!configRes.ok) throw new Error('Cannot fetch server configuration.');

      const config = await configRes.json();

      if (!config.tenantId || !config.clientId) {
        throw new Error('Azure AD Tenant ID and Client ID must be configured in Settings first.');
      }

      // Initialize MSAL
      const msalConfig: Configuration = {
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage' },
      };

      if (!pcaRef.current) {
        pcaRef.current = new PublicClientApplication(msalConfig);
        await pcaRef.current.initialize();
      }

      // Attempt login with redirect (supports MFA)
      const loginResponse = await pcaRef.current.loginPopup({
        scopes: ['User.Read', 'openid', 'profile', 'email'],
        prompt: 'select_account',
      });

      const idToken = loginResponse.idToken;
      const email = loginResponse.account?.username || '';

      if (!idToken || !email) {
        throw new Error('Failed to obtain login credentials from Microsoft.');
      }

      // Send idToken to our backend for validation
      const backendRes = await fetch('/api/admin/auth/mfa-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, email }),
      });

      const data = await backendRes.json();

      if (!backendRes.ok || !data.success) {
        throw new Error(data.error || 'MFA login validation failed.');
      }

      // Callback with token and user info
      onMfaSuccess(data.token, data.user);
    } catch (err: any) {
      // Ignore popup closed by user
      if (err.errorCode === 'user_cancelled' || err.message?.includes('popup')) {
        setError(null);
      } else {
        setError(err.message || 'MFA login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200 mb-4">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleMfaLogin}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-60"
      >
        {loading ? (
          <LoaderIcon />
        ) : (
          <svg className="size-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="19" height="19" rx="2" fill="#0078D4" />
            <path d="M11 5H7V7H11V5Z" fill="white" />
            <path d="M13 7H11V9H13V7Z" fill="white" />
            <path d="M15 9H13V11H15V9Z" fill="white" />
            <path d="M13 11H11V13H13V11Z" fill="white" />
            <path d="M11 9H9V11H11V9Z" fill="white" />
            <path d="M9 7H7V9H9V7Z" fill="white" />
            <path d="M11 11H9V13H11V11Z" fill="white" />
          </svg>
        )}
        {loading ? 'Signing in...' : 'Sign in with Microsoft (MFA)'}
      </button>
    </>
  );
}
