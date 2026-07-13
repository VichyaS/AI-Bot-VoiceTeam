import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { DepartmentEntry } from '../types';

/* ── Result type ──────────────────────────────────────────────────── */

export interface DeptApiResult {
  success: boolean;
  message?: string;
  departments?: DepartmentEntry[];
  error?: string;
}

/* ── Hook ─────────────────────────────────────────────────────────── */

export function useDepartments() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<DepartmentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  function authHeaders() {
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  const fetchDepts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/departments', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json() as { departments: DepartmentEntry[] };
        setDepartments(data.departments);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  const addDepartment = async (entry: DepartmentEntry): Promise<DeptApiResult> => {
    try {
      const res = await fetch('/api/admin/departments', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(entry),
      });
      const data = await res.json() as DeptApiResult;
      if (res.ok && data.departments) setDepartments(data.departments);
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateDepartment = async (index: number, entry: DepartmentEntry): Promise<DeptApiResult> => {
    try {
      const res = await fetch(`/api/admin/departments/${index}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(entry),
      });
      const data = await res.json() as DeptApiResult;
      if (res.ok && data.departments) setDepartments(data.departments);
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const deleteDepartment = async (index: number): Promise<DeptApiResult> => {
    try {
      const res = await fetch(`/api/admin/departments/${index}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json() as DeptApiResult;
      if (res.ok && data.departments) setDepartments(data.departments);
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return { departments, loading, fetchDepts, addDepartment, updateDepartment, deleteDepartment };
}