import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

/* ── Types ────────────────────────────────────────────────────────── */

export type UserRole = 'SUPER_ADMIN' | 'IVR_MANAGER';

interface AuthUser {
  username: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  initializing: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  isAuthenticated: boolean;
  role: UserRole | null;
  isSuperAdmin: boolean;
}

/* ── Context ──────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'ac_bot_admin_token';
const USER_KEY = 'ac_bot_admin_user';

/* ── Provider ─────────────────────────────────────────────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Initialization: wait for token to be read from localStorage
  useEffect(() => {
    // Short delay to ensure token is read from storage
    const timer = setTimeout(() => setInitializing(false), 50);
    return () => clearTimeout(timer);
  }, []);

  // Persist to localStorage (shared across tabs)
  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        return data.error || 'Login failed.';
      }

      setToken(data.token);
      setUser(data.user);
      return null; // no error
    } catch (err) {
      return 'Network error. Could not reach the server.';
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        initializing,
        login,
        logout,
        isAuthenticated: !!token,
        role: user?.role ?? null,
        isSuperAdmin: user?.role === 'SUPER_ADMIN',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}