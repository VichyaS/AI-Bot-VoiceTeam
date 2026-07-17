import { getConfig } from '../config-manager.js';
import { DEFAULT_DEPARTMENTS, type DepartmentEntry } from './routing-types.js';
import { deptRouteCache } from '../cache.js';

function getAdvertisedSipDomain(): string {
  const cfg = getConfig();
  return cfg.sipDomain?.replace(/^sip:/iu, '') || 'company.com';
}

/**
 * Normalizes department SIP URIs that were stored with the dashboard's
 * placeholder extension domain so they resolve against the live SIP domain.
 */
export function normalizeDepartmentSipUri(sipUri: string): string {
  const trimmed = sipUri.trim();
  const match = /^sip:(\+?[1-9]\d{1,14})@placeholder\.domain$/iu.exec(trimmed);
  if (!match) return trimmed;

  return `sip:${match[1]}@${getAdvertisedSipDomain()}`;
}

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

  // Generate a checksum from the full route table so config edits invalidate the cache.
  const checksum = JSON.stringify(depts.map((dept) => ({
    name: dept.name,
    sipUri: dept.sipUri,
    aliases: dept.aliases,
  })));
  const cached = deptRouteCache.get(checksum);
  if (cached) return cached as DepartmentEntry[];

  const normalized = depts.map((dept) => ({
    ...dept,
    sipUri: normalizeDepartmentSipUri(dept.sipUri),
  }));

  deptRouteCache.set(checksum, normalized);
  return normalized;
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