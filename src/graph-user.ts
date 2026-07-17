import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { getConfig } from './config-manager.js';
import { broadcastSystemAlert } from './system-logger.js';
import { entraIdCache, negativeCache } from './cache.js';

// Reuse the Graph client across calls (keeps connection pool alive)
let _graphClient: Client | null = null;
let _lastCredentialHash = '';

function getGraphClient(): Client | null {
  const cfg = getConfig();
  const tenantId = cfg.tenantId || process.env.AZURE_TENANT_ID || '';
  const clientId = cfg.clientId || process.env.AZURE_CLIENT_ID || '';
  const clientSecret = cfg.clientSecret || process.env.AZURE_CLIENT_SECRET || '';

  if (!tenantId || !clientId || !clientSecret) return null;

  const hash = `${tenantId}:${clientId}`;
  if (_graphClient && _lastCredentialHash === hash) return _graphClient;

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  _graphClient = Client.initWithMiddleware({
    authProvider,
  });
  _lastCredentialHash = hash;
  return _graphClient;
}

/**
 * Invalidates the Entra ID cache (call after config change).
 */
export function clearEntraIdCache(): void {
  entraIdCache.clear();
  negativeCache.clear();
  _graphClient = null;
}

/**
 * Result from an Entra ID user lookup.
 */
export interface EntraIdLookupResult {
  /** The matched user's UPN, or null if no unique match */
  upn: string | null;
  /** The matched user's phone number (tel: removed), or null if missing */
  phoneNumber: string | null;
  /** Transfer-ready target (currently mapped from phoneNumber) */
  transferTarget: string | null;
  /** All matching users (for duplicate name detection) */
  matches: { displayName: string; userPrincipalName: string; phoneNumber: string | null }[];
  /** Whether multiple users were found with the same name */
  isDuplicate: boolean;
}

interface GraphUserRecord {
  displayName?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  businessPhones?: string[];
  mobilePhone?: string;
}

export function normalizePhoneForTransfer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .replace(/^tel:/iu, '')
    .replace(/[\s()-]/gu, '');

  return normalized.length > 0 ? normalized : null;
}

export function buildEntraUserLookupFilter(name: string): string {
  const escapedName = name.trim().replace(/'/g, "''");
  return [
    `startswith(displayName, '${escapedName}')`,
    `startswith(userPrincipalName, '${escapedName}')`,
    `startswith(givenName, '${escapedName}')`,
    `startswith(surname, '${escapedName}')`,
    `startswith(mail, '${escapedName}')`,
  ].join(' or ');
}

function pickPhoneNumber(user: GraphUserRecord): string | null {
  const candidates: (string | null | undefined)[] = [
    user.businessPhones?.[0],
    user.mobilePhone,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhoneForTransfer(candidate);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Searches Microsoft Entra ID (Azure AD) for users whose displayName starts
 * with the given Thai name (or any name string).
 *
 * Returns all matching users so the caller can detect duplicates and
 * prompt the caller to be more specific.
 *
 * Credentials are read from the live in-memory config, so changes via the
 * admin dashboard take effect immediately. Falls back to environment
 * variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).
 */
export async function findTeamsUserByThaiName(
  name: string,
): Promise<EntraIdLookupResult> {
  const cfg = getConfig();
  const tenantId = cfg.tenantId || process.env.AZURE_TENANT_ID || '';
  const clientId = cfg.clientId || process.env.AZURE_CLIENT_ID || '';
  const clientSecret = cfg.clientSecret || process.env.AZURE_CLIENT_SECRET || '';

  if (!tenantId || !clientId || !clientSecret) {
    console.error(
      '[findTeamsUserByThaiName] Missing Azure credentials.',
    );
    return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
  }

  if (!name || name.trim().length === 0) {
    return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
  }

  const key = name.trim().toLowerCase();

  // ── Check in-memory cache before calling Graph API ────────────────
  const cached = entraIdCache.get(key);
  if (cached !== undefined) {
    console.log(`[findTeamsUserByThaiName] Cache hit for "${name}": ${cached ?? 'null'}`);
    if (cached === null) {
      return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
    }
    return {
      upn: null,
      phoneNumber: cached,
      transferTarget: cached,
      matches: [{ displayName: name, userPrincipalName: '', phoneNumber: cached }],
      isDuplicate: false,
    };
  }

  // Check negative cache (previously not found)
  if (negativeCache.get(key) !== undefined) {
    console.log(`[findTeamsUserByThaiName] Negative cache hit for "${name}"`);
    return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
  }

  const graphClient = getGraphClient();
  if (!graphClient) return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };

  try {
    // Support lookup by displayName, username (UPN/mail), first name, and last name.
    const filter = buildEntraUserLookupFilter(name);

    const result = await graphClient
      .api('/users')
      .filter(filter)
      .select(['userPrincipalName', 'displayName', 'givenName', 'surname', 'mail', 'businessPhones', 'mobilePhone'])
      .top(10)
      .get() as { value: GraphUserRecord[] };

    const users = result.value || [];

    if (!users || users.length === 0) {
      console.log(`[findTeamsUserByThaiName] No user found matching name: "${name}"`);
      negativeCache.set(key, true);
      return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
    }

    const mappedUsers = users.map((u) => ({
      displayName: u.displayName || '',
      userPrincipalName: u.userPrincipalName || '',
      phoneNumber: pickPhoneNumber(u),
    }));

    // Check for duplicate names
    if (mappedUsers.length > 1) {
      console.log(`[findTeamsUserByThaiName] Found ${users.length} users matching "${name}":`);
      for (const u of mappedUsers) {
        console.log(`  - ${u.displayName} <${u.userPrincipalName}> phone=${u.phoneNumber ?? 'n/a'}`);
      }
      // Don't cache duplicate results — caller needs to disambiguate
      return {
        upn: null,
        phoneNumber: null,
        transferTarget: null,
        matches: mappedUsers,
        isDuplicate: true,
      };
    }

    const matched = mappedUsers[0];
    const matchedPhone = matched.phoneNumber;
    console.log(
      `[findTeamsUserByThaiName] Found user: ${matched.displayName} <${matched.userPrincipalName}> phone=${matchedPhone ?? 'n/a'}`,
    );

    if (!matchedPhone) {
      console.log(`[findTeamsUserByThaiName] User matched but no phone number: "${name}"`);
      negativeCache.set(key, true);
      return {
        upn: matched.userPrincipalName || null,
        phoneNumber: null,
        transferTarget: null,
        matches: [matched],
        isDuplicate: false,
      };
    }

    // Cache the normalized phone number for transfer.
    entraIdCache.set(key, matchedPhone);
    return {
      upn: matched.userPrincipalName || null,
      phoneNumber: matchedPhone,
      transferTarget: matchedPhone,
      matches: [matched],
      isDuplicate: false,
    };
  } catch (error: any) {
    const msg = error?.message ?? String(error);

    // Detect expired/invalid client secret or credential issues
    if (
      msg.includes('AADSTS7000222') ||  // Expired client secret
      msg.includes('AADSTS700016') ||  // Invalid client ID
      msg.includes('AADSTS50034') ||   // Invalid tenant
      msg.includes('client_secret') ||
      msg.includes('credential')
    ) {
      broadcastSystemAlert('CRITICAL', `Azure AD authentication failed: ${msg.slice(0, 120)}`);
    }

    console.error('[findTeamsUserByThaiName] Graph API error:', error);
    return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
  }
}