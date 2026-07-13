/**
 * Lightweight in-memory cache with TTL support.
 * Used to cache Entra ID user lookups and department routing tables
 * so we avoid redundant API calls and disk reads.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private defaultTtlMs: number = 60_000) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/* ── Singleton caches ─────────────────────────────────────────────── */

/** Cache for Entra ID user lookups: name → UPN (TTL: 5 minutes) */
export const entraIdCache = new TtlCache<string | null>(5 * 60_000);

/** Cache for department routing table keyed by config checksum */
export const deptRouteCache = new TtlCache<readonly { name: string; sipUri: string; aliases: readonly string[] }[]>(5 * 60_000);

/** Small cache for negative lookups (no match found) — shorter TTL */
export const negativeCache = new TtlCache<true>(30_000);