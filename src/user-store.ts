import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserRole } from './auth-jwt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_PATH = path.resolve(__dirname, '..', 'users.json');

/* ── Types ────────────────────────────────────────────────────────── */

export interface StoredUser {
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
  /** ISO date string (e.g. "2026-12-31") or empty for no expiry */
  expiryDate?: string;
}

/* ── Store ────────────────────────────────────────────────────────── */

let _users: StoredUser[] = [];

function loadUsers(): StoredUser[] {
  try {
    if (fs.existsSync(USERS_PATH)) {
      const raw = fs.readFileSync(USERS_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredUser[];
      console.log(`[users] Loaded ${parsed.length} user(s) from ${USERS_PATH}`);
      return parsed;
    }
  } catch (err) {
    console.warn('[users] Failed to read users.json:', err);
  }

  // Fallback: single user from env vars
  const envUsername = process.env.ADMIN_USERNAME || 'admin';
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  const envRole = (process.env.ADMIN_ROLE as UserRole) || 'SUPER_ADMIN';

  if (envHash) {
    const fallback: StoredUser = {
      username: envUsername,
      passwordHash: envHash,
      role: envRole,
      displayName: envUsername,
    };
    console.log(`[users] Using env-based single user: ${envUsername} (${envRole})`);
    return [fallback];
  }

  console.warn('[users] No users configured. Set ADMIN_PASSWORD_HASH or run `npm run seed-users`.');
  return [];
}

// Initialize on module load
_users = loadUsers();

/* ── Public API ───────────────────────────────────────────────────── */

export function findUserByUsername(username: string): StoredUser | undefined {
  return _users.find((u) => u.username === username);
}

export function getUsers(): StoredUser[] {
  return _users;
}

/** Add a new user (password must already be hashed) */
export function addUser(user: StoredUser): boolean {
  if (_users.find((u) => u.username === user.username)) return false;
  _users.push(user);
  persistUsers();
  return true;
}

/** Update an existing user by username */
export function updateUser(username: string, patch: Partial<StoredUser>): boolean {
  const idx = _users.findIndex((u) => u.username === username);
  if (idx === -1) return false;
  _users[idx] = { ..._users[idx], ...patch };
  persistUsers();
  return true;
}

/** Delete a user by username */
export function deleteUser(username: string): boolean {
  const idx = _users.findIndex((u) => u.username === username);
  if (idx === -1) return false;
  _users.splice(idx, 1);
  persistUsers();
  return true;
}

function persistUsers(): void {
  try {
    fs.writeFileSync(USERS_PATH, JSON.stringify(_users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[users] Failed to write users.json:', err);
  }
}

/** Re-read users.json from disk */
export function reloadUsers(): void {
  _users = loadUsers();
}