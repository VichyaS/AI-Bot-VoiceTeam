import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULTS, validate, type ConfigFormState, type ValidationErrors } from '../types';
import { useAuth } from '../contexts/AuthContext';

/* ── Toast type ───────────────────────────────────────────────────── */
export interface Toast {
  message: string;
  type: 'success' | 'error';
}

/* ── Hook return type ─────────────────────────────────────────────── */
export interface UseConfigApiReturn {
  form: ConfigFormState;
  patch: (patch: Partial<ConfigFormState>) => void;
  setForm: React.Dispatch<React.SetStateAction<ConfigFormState>>;
  errors: ValidationErrors;
  loading: boolean;
  saving: boolean;
  testing: 'idle' | 'openrouter' | 'azure';
  toast: Toast | null;
  dismissToast: () => void;
  handleSave: () => Promise<void>;
  handleTestConnection: (serviceType: 'openrouter' | 'azure') => Promise<void>;
  /** Returns the full debug result for the modal — does NOT set toast/testing state */
  runTestConnection: (serviceType: 'openrouter' | 'azure') => Promise<{
    success: boolean;
    service: string;
    message?: string;
    debugLogs: string[];
    errorMessage: string | null;
  }>;
  /** Persisted success message from the last save, cleared on next edit */
  successBanner: string | null;
  dismissSuccessBanner: () => void;
}

/* ── Base URL helper ──────────────────────────────────────────────── */
function apiBase(): string {
  // In production the dashboard is served from the same origin as the backend
  return '';
}

/* ── Hook ─────────────────────────────────────────────────────────── */
export function useConfigApi(): UseConfigApiReturn {
  const [form, setForm] = useState<ConfigFormState>({ ...DEFAULTS });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'idle' | 'openrouter' | 'azure'>('idle');
  const [toast, setToast] = useState<Toast | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const { token } = useAuth();

  /** Helper: headers with JWT Bearer token for admin API calls. */
  function authHeaders(headers: Record<string, string> = {}): Record<string, string> {
    const activeToken = token || localStorage.getItem('ac_bot_admin_token');
    return activeToken ? { ...headers, 'Authorization': `Bearer ${activeToken}` } : headers;
  }

  // Track mounted state to avoid setting state after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (mountedRef.current) setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => {
    if (mountedRef.current) setToast(null);
  }, []);

  const dismissSuccessBanner = useCallback(() => {
    if (mountedRef.current) setSuccessBanner(null);
  }, []);

  /* ── 1. Fetch existing config on mount ──────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function fetchConfig() {
      // Wait for token to be available
      const activeToken = token || localStorage.getItem('ac_bot_admin_token');
      if (!activeToken) {
        console.warn('[useConfigApi] No auth token available yet, skipping fetch.');
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${apiBase()}/api/admin/config`, {
          headers: { 'Authorization': `Bearer ${activeToken}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: Partial<ConfigFormState> = await res.json();

        if (!cancelled) {
          setForm((prev) => ({
            ...prev,
            // Only overwrite fields that came back from the server
            ...Object.fromEntries(
              Object.entries(data).filter(
                ([, v]) => v !== undefined && v !== null,
              ),
            ),
          }));
        }
      } catch (err) {
        console.warn('[useConfigApi] Failed to fetch config, using defaults:', err);
        // Silently use defaults — the backend may not be running yet
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchConfig();
    return () => { cancelled = true; };
  }, [token]);

  /* ── Patch helper (clears individual field errors) ──────────────── */
  const patch = useCallback((patchObj: Partial<ConfigFormState>) => {
    setForm((prev) => ({ ...prev, ...patchObj }));
    setSuccessBanner(null);
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patchObj)) delete next[key];
      return next;
    });
  }, []);

  /* ── 2. Save config ─────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      showToast('Please fix the validation errors before saving.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase()}/api/admin/config`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Show the verification success message from the backend
      if (data.message) {
        setSuccessBanner(data.message);
      }
      showToast('Settings saved successfully.', 'success');
    } catch (err) {
      console.error('[useConfigApi] Save failed:', err);
      showToast('Failed to save settings. Please try again.', 'error');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [form, showToast]);

  /* ── 3. Test connection (simple toast) ──────────────────────────── */
  const handleTestConnection = useCallback(
    async (serviceType: 'openrouter' | 'azure') => {
      if (serviceType === 'openrouter' && !form.openRouterApiKey.trim()) {
        showToast('Enter an OpenRouter API key first.', 'error');
        return;
      }
      if (serviceType === 'azure' && (!form.tenantId.trim() || !form.clientId.trim() || !form.clientSecret.trim())) {
        showToast('Fill in all Azure AD credentials first.', 'error');
        return;
      }

      setTesting(serviceType);
      try {
        const res = await fetch(`${apiBase()}/api/admin/test-connection`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ service: serviceType }),
        });

        const data = await res.json() as { success: boolean; error?: string; message?: string };

        if (!res.ok || data.success === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        showToast(
          serviceType === 'openrouter'
            ? 'OpenRouter connection successful!'
            : 'Azure AD connection successful!',
          'success',
        );
      } catch (err) {
        console.error('[useConfigApi] Test connection failed:', err);
        showToast(
          serviceType === 'openrouter'
            ? `OpenRouter failed: ${(err as Error).message}`
            : `Azure AD failed: ${(err as Error).message}`,
          'error',
        );
      } finally {
        if (mountedRef.current) setTesting('idle');
      }
    },
    [form, showToast],
  );

  /* ── 4. Test connection (detailed debug — for modal) ───────────── */
  const runTestConnection = useCallback(
    async (serviceType: 'openrouter' | 'azure') => {
      const res = await fetch(`${apiBase()}/api/admin/test-connection`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ service: serviceType }),
      });
      const data = await res.json() as {
        success: boolean;
        service: string;
        message?: string;
        debugLogs: string[];
        errorMessage: string | null;
      };
      return data;
    },
    [form, showToast],
  );

  return {
    form,
    patch,
    setForm,
    errors,
    loading,
    saving,
    testing,
    toast,
    dismissToast,
    successBanner,
    dismissSuccessBanner,
    handleSave,
    handleTestConnection,
    runTestConnection,
  };
}