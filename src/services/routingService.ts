import { getConfig } from '../config-manager.js';
import { DEFAULT_DEPARTMENTS, type DepartmentEntry } from './routing-types.js';
import { deptRouteCache } from '../cache.js';

/**
 * Returns the active department routing table.
 * Reads from the live in-memory config (departments field),
 * falling back to the built-in defaults if not yet configured.
 * Results are cached via in-memory TTL cache.
 */
export function getDepartmentRoutes(): DepartmentEntry[] {
  const cfg = getConfig();
  const depts = cfg.departments && cfg.departments.length > 0
    ? cfg.departments
    : DEFAULT_DEPARTMENTS;

  // Generate a simple checksum to detect changes
  const checksum = `${depts.length}:${depts[0]?.name || ''}`;
  const cached = deptRouteCache.get(checksum);
  if (cached) return cached as DepartmentEntry[];

  deptRouteCache.set(checksum, depts);
  return depts;
}

/**
 * Maps a cleaned department name/alias to its SIP URI.
 *
 * @param cleaned - The input after trimming, prefix-stripping, and lowercasing.
 * @param routes  - The active department route table.
 * @returns The matching SIP URI, or null.
 */
export function matchDepartment(
  cleaned: string,
  routes: DepartmentEntry[],
): string | null {
  for (const dept of routes) {
    for (const alias of dept.aliases) {
      if (cleaned === alias || cleaned.includes(alias) || alias.includes(cleaned)) {
        return dept.sipUri;
      }
    }
  }
  return null;
}