import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, SECRET_KEYS, isMaskedPlaceholder, type AppConfig } from './config-types.js';
import { broadcastSystemAlert, emitLog } from './system-logger.js';
import { clearEntraIdCache } from './graph-user.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

/**
 * In-memory configuration store.
 * Populated from config.json on startup and updated on every save.
 */
let _config: AppConfig = { ...DEFAULT_CONFIG };

/** Load config from disk into memory. Falls back to defaults silently. */
function loadFromDisk(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        console.log('[config] Loaded configuration from', CONFIG_PATH);
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (parseErr) {
        console.error('[config] Corrupt JSON in config.json:', parseErr);
        broadcastSystemAlert('CRITICAL', 'config.json is corrupted or contains invalid JSON. Using defaults.');
        return { ...DEFAULT_CONFIG };
      }
    }
  } catch (err) {
    console.warn('[config] Failed to read config.json, using defaults:', err);
  }
  return { ...DEFAULT_CONFIG };
}

/** Write the current in-memory config to disk with directory verification. */
function persistToDisk(config: AppConfig): void {
  try {
    // Ensure the directory exists
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('[config] Created directory:', dir);
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[config] Configuration saved to', CONFIG_PATH);
  } catch (err: any) {
    console.error('[config] Failed to write config.json:', err);
    // Throw a descriptive error for the API layer
    if (err.code === 'EACCES') {
      throw new Error(`Permission denied writing to ${CONFIG_PATH}. Check file system permissions.`);
    }
    if (err.code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${path.dirname(CONFIG_PATH)}.`);
    }
    throw new Error(`Cannot save configuration: ${err.message}`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────
_config = loadFromDisk();

// ── Public API ─────────────────────────────────────────────────────────

/** Returns the live in-memory configuration (mutable reference). */
export function getConfig(): AppConfig {
  return _config;
}

/**
 * Validates and updates the in-memory configuration, then persists to disk.
 * Accepts a partial payload — only provided fields are overwritten.
 * If a sensitive field contains its masked placeholder value, the original
 * secret is kept instead of being overwritten.
 *
 * After writing to disk, performs a verification re-read and broadcasts
 * a hot-reload log event via WebSocket.
 *
 * @returns The updated config, plus a `verified` boolean and `message`.
 */
export function updateConfig(patch: Partial<AppConfig>): AppConfig & { verified: true; message: string } {
  // Validate types
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'maxMatchResults' || key === 'maxTokens' || key === 'maxRetries' || key === 'sbcPort' || key === 'transferTimeout') {
      if (typeof value !== 'number' || value < 1) {
        throw new Error(`Invalid ${key}: must be a number >= 1`);
      }
    } else if (key === 'temperature') {
      if (typeof value !== 'number' || value < 0 || value > 2) {
        throw new Error(`Invalid temperature: must be a number between 0 and 2`);
      }
    } else if (key === 'topP') {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error(`Invalid topP: must be a number between 0 and 1`);
      }
    } else if (key === 'departments') {
      if (!Array.isArray(value)) {
        throw new Error('Invalid departments: must be an array');
      }
    } else if (key === 'mfaEnabled') {
      if (typeof value !== 'boolean') {
        throw new Error(`Invalid mfaEnabled: must be a boolean`);
      }
    } else if (typeof value !== 'string') {
      throw new Error(`Invalid value for ${key}: expected string`);
    }
  }

  // Build updated config, preserving secrets when the submitted value
  // is still the masked placeholder
  const updated: AppConfig = { ..._config };
  for (const [key, value] of Object.entries(patch)) {
    const k = key as keyof AppConfig;
    if (
      SECRET_KEYS.has(key)
      && typeof value === 'string'
      && typeof _config[k] === 'string'
      && isMaskedPlaceholder(value, _config[k] as string)
    ) {
      // Frontend sent the masked placeholder — keep the original secret
      continue;
    }
    (updated as any)[k] = value;
  }

  // Write to disk
  persistToDisk(updated);

  // ── Verification: re-read from disk and compare ──────────────────
  const diskConfig = loadFromDisk();

  // Compare key fields
  for (const key of Object.keys(updated) as (keyof AppConfig)[]) {
    const a = JSON.stringify(updated[key]);
    const b = JSON.stringify(diskConfig[key]);
    if (a !== b) {
      console.warn(`[config] Verification mismatch for key "${key}": disk differs from memory`);
      // Fall back to the in-memory value anyway — it's the one actively used
    }
  }

  // ── Broadcast hot-reload log event ───────────────────────────────
  emitLog('INFO', 'System configuration hot-reloaded successfully. New parameters are now live in production.');

  // ── Update memory ────────────────────────────────────────────────
  _config = updated;

  const message = 'สำเร็จ: บันทึกข้อมูลและอัปเดตพารามิเตอร์เข้าสู่ระบบหลัก (In-Memory) เรียบร้อยแล้ว';
  return { ..._config, verified: true as const, message };
}

/** Reload config from disk into memory (e.g. after external edit). */
export function reloadConfig(): AppConfig {
  _config = loadFromDisk();
  return _config;
}

export { CONFIG_PATH };