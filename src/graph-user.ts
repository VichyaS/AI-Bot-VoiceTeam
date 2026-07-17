import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { getConfig } from './config-manager.js';
import { broadcastSystemAlert } from './system-logger.js';
import { entraIdCache, negativeCache } from './cache.js';

// Reuse the Graph client across calls (keeps connection pool alive)
let _graphClient: Client | null = null;
let _lastCredentialHash = '';

/**
 * Test-only helper for injecting a mocked Graph client.
 */
export function setGraphClientForTesting(client: Client | null): void {
  _graphClient = client;
  const cfg = getConfig();
  const tenantId = cfg.tenantId || process.env.AZURE_TENANT_ID || '';
  const clientId = cfg.clientId || process.env.AZURE_CLIENT_ID || '';
  _lastCredentialHash = `${tenantId}:${clientId}`;
}

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
  matches: EntraUserMatch[];
  /** Whether multiple users were found with the same name */
  isDuplicate: boolean;
}

export interface EntraUserMatch {
  displayName: string;
  userPrincipalName: string;
  phoneNumber: string | null;
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
    .split(';')[0]
    .replace(/[^\d+]/gu, '');

  return normalized.length > 0 ? normalized : null;
}

function getPhoneLast4(raw: string | null | undefined): string | null {
  const normalized = normalizePhoneForTransfer(raw);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/gu, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
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

function isFourDigitExtension(value: string): boolean {
  return /^\d{4}$/u.test(value.trim());
}

export function formatDuplicateUserChoicesForThaiTts(matches: readonly EntraUserMatch[]): string {
  return matches
    .map((m) => {
      const last4 = getPhoneLast4(m.phoneNumber) || '';
      const spokenLast4 = last4.split('').join(' ');
      return last4
        ? `${m.displayName} เบอร์ลงท้าย ${spokenLast4}`
        : `${m.displayName} ไม่พบเบอร์`;
    })
    .join(' , ');
}

type GraphUsersResponse = {
  value?: GraphUserRecord[];
  '@odata.nextLink'?: string;
};

async function queryGraphUsers(
  graphClient: Client,
  options?: { filter?: string; top?: number },
): Promise<GraphUserRecord[]> {
  let request = graphClient.api('/users');
  if (options?.filter) {
    request = request.filter(options.filter);
  }

  const result = await request
    .select(['userPrincipalName', 'displayName', 'givenName', 'surname', 'mail', 'businessPhones', 'mobilePhone'])
    .top(options?.top ?? 10)
    .get() as GraphUsersResponse;

  return result.value || [];
}

async function queryGraphUsersPage(
  graphClient: Client,
  options?: { path?: string; top?: number },
): Promise<{ users: GraphUserRecord[]; nextLink: string | null }> {
  let request = graphClient.api(options?.path || '/users');
  if (!options?.path) {
    request = request
      .select(['userPrincipalName', 'displayName', 'givenName', 'surname', 'mail', 'businessPhones', 'mobilePhone'])
      .top(options?.top ?? 200);
  }

  const result = await request.get() as GraphUsersResponse;
  return {
    users: result.value || [],
    nextLink: result['@odata.nextLink'] || null,
  };
}

async function queryGraphUserByUpn(
  graphClient: Client,
  upn: string,
): Promise<GraphUserRecord | null> {
  try {
    const result = await graphClient
      .api(`/users/${encodeURIComponent(upn)}`)
      .select(['userPrincipalName', 'displayName', 'givenName', 'surname', 'mail', 'businessPhones', 'mobilePhone'])
      .get() as GraphUserRecord;
    return result;
  } catch {
    return null;
  }
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

  const query = name.trim();
  const key = query.toLowerCase();

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
    if (isFourDigitExtension(query)) {
      const extensionMatches: EntraUserMatch[] = [];
      let nextLink: string | null = null;
      let pages = 0;

      do {
        const page = await queryGraphUsersPage(graphClient, nextLink ? { path: nextLink } : { top: 200 });
        pages += 1;

        for (const u of page.users) {
          const phoneNumber = pickPhoneNumber(u);
          const last4 = getPhoneLast4(phoneNumber);
          if (last4 === query) {
            extensionMatches.push({
              displayName: u.displayName || '',
              userPrincipalName: u.userPrincipalName || '',
              phoneNumber,
            });
            if (extensionMatches.length > 1) break;
          }
        }

        if (extensionMatches.length > 1) break;
        nextLink = page.nextLink;
      } while (nextLink && pages < 20);

      if (extensionMatches.length === 0) {
        console.log(`[findTeamsUserByThaiName] No user found matching extension: "${query}"`);
        negativeCache.set(key, true);
        return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
      }

      if (extensionMatches.length > 1) {
        console.log(`[findTeamsUserByThaiName] Found ${extensionMatches.length} users matching extension "${query}"`);
        return {
          upn: null,
          phoneNumber: null,
          transferTarget: null,
          matches: extensionMatches,
          isDuplicate: true,
        };
      }

      const matched = extensionMatches[0];
      if (!matched.phoneNumber) {
        negativeCache.set(key, true);
        return {
          upn: matched.userPrincipalName || null,
          phoneNumber: null,
          transferTarget: null,
          matches: [matched],
          isDuplicate: false,
        };
      }

      entraIdCache.set(key, matched.phoneNumber);
      return {
        upn: matched.userPrincipalName || null,
        phoneNumber: matched.phoneNumber,
        transferTarget: matched.phoneNumber,
        matches: [matched],
        isDuplicate: false,
      };
    }

    // Support lookup by displayName, username (UPN/mail), first name, and last name.
    const filter = buildEntraUserLookupFilter(query);
    const users = await queryGraphUsers(graphClient, { filter, top: 10 });

    if (!users || users.length === 0) {
      console.log(`[findTeamsUserByThaiName] No user found matching name: "${name}"`);
      negativeCache.set(key, true);
      return { upn: null, phoneNumber: null, transferTarget: null, matches: [], isDuplicate: false };
    }

    const mappedUsers = users.map((u): EntraUserMatch => ({
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
      if (matched.userPrincipalName) {
        const detail = await queryGraphUserByUpn(graphClient, matched.userPrincipalName);
        const detailPhone = detail ? pickPhoneNumber(detail) : null;
        if (detailPhone) {
          console.log(`[findTeamsUserByThaiName] Resolved phone from user detail: ${detailPhone}`);
          entraIdCache.set(key, detailPhone);
          return {
            upn: matched.userPrincipalName || null,
            phoneNumber: detailPhone,
            transferTarget: detailPhone,
            matches: [{ ...matched, phoneNumber: detailPhone }],
            isDuplicate: false,
          };
        }
      }

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