#!/usr/bin/env node

/**
 * Seed script for creating test users with different roles.
 *
 * Usage:
 *   npm run seed-users
 *   npm run seed-users -- --reset
 *
 * This creates a `users.json` file with two test accounts.
 * The server reads `users.json` on startup to support
 * multi-user login with Role-Based Access Control (RBAC).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to root: scripts/../.. = root
const USERS_PATH = path.resolve(__dirname, '..', '..', 'users.json');

const SALT_ROUNDS = 10;

interface SeedUser {
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'IVR_MANAGER';
  displayName: string;
}

const DEFAULT_USERS: Omit<SeedUser, 'passwordHash'>[] = [
  {
    username: 'superadmin',
    role: 'SUPER_ADMIN',
    displayName: 'Super Admin',
  },
  {
    username: 'operator1',
    role: 'IVR_MANAGER',
    displayName: 'Operator 1',
  },
];

const DEFAULT_PASSWORDS: Record<string, string> = {
  'superadmin': 'superadmin123',
  'operator1': 'operator123',
};

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');

  // Check if users.json already exists
  if (fs.existsSync(USERS_PATH) && !reset) {
    console.log('[seed] users.json already exists. Use --reset to overwrite.');
    console.log(`       ${USERS_PATH}`);
    process.exit(0);
  }

  console.log('[seed] Generating bcrypt password hashes (salt rounds = 10)...\n');

  const users: SeedUser[] = [];

  for (const template of DEFAULT_USERS) {
    const password = DEFAULT_PASSWORDS[template.username] || 'changeme';
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    users.push({
      ...template,
      passwordHash,
    });

    console.log(`  ✓ ${template.username.padEnd(12)} (${template.role.padEnd(13)}) password: ${password}`);
  }

  // Write users.json
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf-8');
  console.log(`\n[seed] Wrote ${users.length} users to ${USERS_PATH}`);
  console.log('[seed] Done.\n');
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});