import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitInfo, emitError } from './system-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.resolve(__dirname, '..', 'unhandled_logs.json');

/* ── Types ────────────────────────────────────────────────────────── */

export interface UnhandledLogEntry {
  id: string;
  timestamp: string;
  userSpeech: string;
  rawAiResponse: unknown;
  status: 'pending_review' | 'resolved';
  /** Optional admin note left after resolution */
  resolutionNote?: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function generateId(): string {
  return `UL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLogs(): UnhandledLogEntry[] {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const raw = fs.readFileSync(LOG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[unhandled-intents] Failed to read log file:', err);
  }
  return [];
}

function writeLogs(logs: UnhandledLogEntry[]): void {
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[unhandled-intents] Failed to write log file:', err);
  }
}

/* ── Public API ───────────────────────────────────────────────────── */

/**
 * Appends a new unhandled-intent log entry to `unhandled_logs.json`.
 * Each entry stores the user's exact speech, the raw AI response,
 * and a default status of "pending_review".
 */
export async function logUnhandledIntent(
  userSpeech: string,
  rawAiResponse: unknown,
): Promise<void> {
  const entry: UnhandledLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    userSpeech,
    rawAiResponse,
    status: 'pending_review',
  };

  const logs = readLogs();
  logs.push(entry);
  writeLogs(logs);

  emitInfo(`Unhandled intent logged: "${userSpeech.slice(0, 60)}" (${entry.id})`);
}

/**
 * Returns all unhandled intent logs, newest first.
 */
export function getUnhandledLogs(): UnhandledLogEntry[] {
  return readLogs().reverse();
}

/**
 * Updates the status of a log entry to "resolved".
 * Returns true if found and updated, false otherwise.
 */
export function resolveUnhandledLog(
  id: string,
  note?: string,
): boolean {
  const logs = readLogs();
  const entry = logs.find((l) => l.id === id);

  if (!entry) return false;

  entry.status = 'resolved';
  if (note) entry.resolutionNote = note;
  writeLogs(logs);

  emitInfo(`Unhandled intent resolved: ${id}`);
  return true;
}