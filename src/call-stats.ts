import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_PATH = path.resolve(__dirname, '..', 'call_stats.json');

/* ── Types ────────────────────────────────────────────────────────── */

export interface CallLogEntry {
  callId: string;
  caller: string;
  callee: string;
  startTime: string;
  endTime?: string;
  durationSec?: number;
  status: 'active' | 'completed' | 'failed' | 'transferred';
  targetType?: string;
  targetValue?: string;
  routingResult?: string;
}

interface CallStatsStore {
  calls: CallLogEntry[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function readStore(): CallStatsStore {
  try {
    if (fs.existsSync(STATS_PATH)) {
      return JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { calls: [] };
}

function writeStore(store: CallStatsStore): void {
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

/* ── Public API ───────────────────────────────────────────────────── */

export function logCallStart(callId: string, caller: string, callee: string): void {
  const store = readStore();
  store.calls.push({
    callId,
    caller,
    callee,
    startTime: new Date().toISOString(),
    status: 'active',
  });
  writeStore(store);
}

export function logCallEnd(callId: string, status: CallLogEntry['status'] = 'completed', routingResult?: string): void {
  const store = readStore();
  const entry = store.calls.find((c) => c.callId === callId);
  if (entry) {
    entry.endTime = new Date().toISOString();
    entry.status = status;
    entry.routingResult = routingResult;
    const start = new Date(entry.startTime).getTime();
    const end = new Date(entry.endTime).getTime();
    entry.durationSec = Math.round((end - start) / 1000);
    writeStore(store);
  }
}

export function logCallRouting(callId: string, targetType: string, targetValue: string): void {
  const store = readStore();
  const entry = store.calls.find((c) => c.callId === callId);
  if (entry) {
    entry.targetType = targetType;
    entry.targetValue = targetValue;
    writeStore(store);
  }
}

export function getCallStats(days: number = 365): {
  totalCalls: number;
  totalMinutes: number;
  avgDurationSec: number;
  completedCalls: number;
  failedCalls: number;
  transferredCalls: number;
  dailyStats: { date: string; calls: number; minutes: number }[];
  monthlyStats: { month: string; calls: number; minutes: number }[];
  recentCalls: CallLogEntry[];
} {
  const store = readStore();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = store.calls.filter((c) => new Date(c.startTime).getTime() >= cutoff);

  const totalCalls = filtered.length;
  const totalMinutes = Math.round(filtered.reduce((sum, c) => sum + (c.durationSec || 0), 0) / 60);
  const completedCalls = filtered.filter((c) => c.status === 'completed').length;
  const failedCalls = filtered.filter((c) => c.status === 'failed').length;
  const transferredCalls = filtered.filter((c) => c.status === 'transferred').length;
  const durations = filtered.map((c) => c.durationSec || 0).filter((d) => d > 0);
  const avgDurationSec = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  // Daily aggregation
  const dailyMap = new Map<string, { calls: number; minutes: number }>();
  for (const c of filtered) {
    const day = c.startTime.slice(0, 10);
    const existing = dailyMap.get(day) || { calls: 0, minutes: 0 };
    existing.calls++;
    existing.minutes += Math.round((c.durationSec || 0) / 60);
    dailyMap.set(day, existing);
  }
  const dailyStats = [...dailyMap.entries()]
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Monthly aggregation
  const monthlyMap = new Map<string, { calls: number; minutes: number }>();
  for (const c of filtered) {
    const month = c.startTime.slice(0, 7);
    const existing = monthlyMap.get(month) || { calls: 0, minutes: 0 };
    existing.calls++;
    existing.minutes += Math.round((c.durationSec || 0) / 60);
    monthlyMap.set(month, existing);
  }
  const monthlyStats = [...monthlyMap.entries()]
    .map(([month, stats]) => ({ month, ...stats }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const recentCalls = [...filtered].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 50);

  return { totalCalls, totalMinutes, avgDurationSec, completedCalls, failedCalls, transferredCalls, dailyStats, monthlyStats, recentCalls };
}

export function getCallStatsCsv(days: number = 365): string {
  const stats = getCallStats(days);
  const rows: string[] = ['Date,Caller,Callee,DurationSec,Status,TargetType,TargetValue,StartTime,EndTime'];
  for (const c of stats.recentCalls) {
    rows.push(`"${c.startTime.slice(0, 10)}","${c.caller}","${c.callee}",${c.durationSec || 0},"${c.status}","${c.targetType || ''}","${c.targetValue || ''}","${c.startTime}","${c.endTime || ''}"`);
  }
  return rows.join('\n');
}
