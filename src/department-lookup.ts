import { getDepartmentRoutes } from './services/routingService.js';

/**
 * Maps a Thai department name (or its English equivalent / synonym) to
 * a Microsoft Teams Resource Account SIP URI.
 *
 * Department mappings are loaded from the live in-memory config (sourced
 * from config.json), which admins can edit via the Web UI — no code
 * changes and no server restart required.
 *
 * @param departmentName - Raw department name from the user's speech
 * @returns A full SIP URI string (e.g. "sip:it-queue@company.com") or null
 */
export function getDepartmentSipUri(
  departmentName: string,
): string | null {
  if (!departmentName || departmentName.trim().length === 0) {
    return null;
  }

  // Step 1: clean the input — lowercase, remove ALL whitespace, strip prefixes
  const cleaned = departmentName
    .trim()
    .replace(/^(ฝ่าย|แผนก|ส่วน|กอง)\s*/u, '')
    .replace(/\s+/gu, '')
    .toLowerCase();

  if (!cleaned) return null;

  // Step 2: read the live department routes from in-memory config
  let routes;
  try {
    routes = getDepartmentRoutes();
  } catch (err) {
    console.error('[getDepartmentSipUri] Failed to read department routes:', err);
    return null;
  }

  if (!routes || routes.length === 0) {
    console.warn('[getDepartmentSipUri] Department route table is empty');
    return null;
  }

  // Step 3: search — check main name first, then aliases
  for (const dept of routes) {
    // Check the display name
    const deptName = dept.name.replace(/\s+/gu, '').toLowerCase();
    if (cleaned === deptName || deptName.includes(cleaned) || cleaned.includes(deptName)) {
      console.log(`[getDepartmentSipUri] Matched "${departmentName}" → ${dept.name} (${dept.sipUri})`);
      return dept.sipUri;
    }

    // Check all aliases
    for (const alias of dept.aliases) {
      const normAlias = alias.replace(/\s+/gu, '').toLowerCase();
      if (cleaned === normAlias || cleaned.includes(normAlias) || normAlias.includes(cleaned)) {
        console.log(`[getDepartmentSipUri] Matched "${departmentName}" → ${dept.name} (${dept.sipUri})`);
        return dept.sipUri;
      }
    }
  }

  console.warn(`[getDepartmentSipUri] No match for "${departmentName}" (cleaned: "${cleaned}")`);
  return null;
}