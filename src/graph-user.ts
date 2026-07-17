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
  _lineUriSelectSupported = true;
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
  telephoneNumber?: string;
  TelephoneNumber?: string;
  telephoneNumbers?: string[];
  TelephoneNumbers?: string[];
  lineUri?: string;
  lineURI?: string;
  LineUri?: string;
  LineURI?: string;
  businessPhones?: string[];
  BusinessPhones?: string[];
  mobilePhone?: string;
  MobilePhone?: string;
}

const USER_SELECT_FIELDS = [
  'userPrincipalName',
  'displayName',
  'givenName',
  'surname',
  'mail',
  'telephoneNumber',
  'businessPhones',
  'mobilePhone',
];

const OPTIONAL_LINE_URI_FIELDS = ['lineUri', 'lineURI'];
let _lineUriSelectSupported = true;

function getUserSelectFields(): string[] {
  return _lineUriSelectSupported
    ? [...USER_SELECT_FIELDS, ...OPTIONAL_LINE_URI_FIELDS]
    : [...USER_SELECT_FIELDS];
}

function isLineUriSelectError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error).toLowerCase();
  return msg.includes('lineuri') && (msg.includes('property') || msg.includes('select'));
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

function getPhoneCandidates(user: GraphUserRecord): string[] {
  const anyUser = user as Record<string, unknown>;
  const altTelephoneNumbers = Array.isArray(anyUser.TelephoneNumbers)
    ? anyUser.TelephoneNumbers as string[]
    : Array.isArray(anyUser.telephoneNumbers)
      ? anyUser.telephoneNumbers as string[]
      : [];

  const rawCandidates: (string | null | undefined)[] = [
    user.lineUri,
    user.lineURI,
    user.LineUri,
    user.LineURI,
    user.telephoneNumber,
    user.TelephoneNumber,
    ...altTelephoneNumbers,
    ...(user.businessPhones || []),
    ...(user.BusinessPhones || []),
    user.mobilePhone,
    user.MobilePhone,
  ];

  const unique = new Set<string>();
  for (const raw of rawCandidates) {
    const normalized = normalizePhoneForTransfer(raw);
    if (normalized) unique.add(normalized);
  }

  return [...unique];
}

function findPhoneByLast4(user: GraphUserRecord, suffix: string): string | null {
  const candidates = getPhoneCandidates(user);
  for (const candidate of candidates) {
    if (getPhoneLast4(candidate) === suffix) return candidate;
  }
  return null;
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
  const buildRequest = () => {
    let request = graphClient.api('/users');
    if (options?.filter) {
      request = request.filter(options.filter);
    }

    return request
      .select(getUserSelectFields())
      .top(options?.top ?? 10);
  };

  try {
    const result = await buildRequest().get() as GraphUsersResponse;
    return result.value || [];
  } catch (error) {
    if (_lineUriSelectSupported && isLineUriSelectError(error)) {
      _lineUriSelectSupported = false;
      const result = await buildRequest().get() as GraphUsersResponse;
      return result.value || [];
    }
    throw error;
  }
}

async function queryGraphUsersPage(
  graphClient: Client,
  options?: { path?: string; top?: number },
): Promise<{ users: GraphUserRecord[]; nextLink: string | null }> {
  const buildRequest = () => {
    const requestPath = options?.path || '/users';
    let request = graphClient.api(requestPath);
    if (!options?.path) {
      request = request
        .select(getUserSelectFields())
        .top(options?.top ?? 200);
    }
    return request;
  };

  try {
    const result = await buildRequest().get() as GraphUsersResponse;
    return {
      users: result.value || [],
      nextLink: result['@odata.nextLink'] || null,
    };
  } catch (error) {
    if (_lineUriSelectSupported && isLineUriSelectError(error)) {
      _lineUriSelectSupported = false;
      const result = await buildRequest().get() as GraphUsersResponse;
      return {
        users: result.value || [],
        nextLink: result['@odata.nextLink'] || null,
      };
    }
    throw error;
  }
}

async function queryGraphUserByUpn(
  graphClient: Client,
  upn: string,
): Promise<GraphUserRecord | null> {
  const buildRequest = () => graphClient
    .api(`/users/${encodeURIComponent(upn)}`)
    .select(getUserSelectFields());

  try {
    const result = await buildRequest().get() as GraphUserRecord;
    return result;
  } catch (error) {
    if (_lineUriSelectSupported && isLineUriSelectError(error)) {
      _lineUriSelectSupported = false;
      try {
        const result = await buildRequest().get() as GraphUserRecord;
        return result;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pickPhoneNumber(user: GraphUserRecord): string | null {
  return getPhoneCandidates(user)[0] || null;
}

function maskPhoneForLog(phone: string): string {
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function normalizeNameForMatch(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/gu, '');
}

function userMatchesName(user: GraphUserRecord, query: string): boolean {
  const q = normalizeNameForMatch(query);
  if (!q) return false;

  const fields = [
    user.displayName,
    user.givenName,
    user.surname,
    user.userPrincipalName,
    user.mail,
  ];

  return fields.some((f) => normalizeNameForMatch(f).includes(q));
}

function logUserPhoneDiagnostics(prefix: string, users: readonly GraphUserRecord[]): void {
  const withPhone = users.filter((u) => getPhoneCandidates(u).length > 0).length;
  const sample = users.slice(0, 5).map((u) => {
    const candidates = getPhoneCandidates(u).map(maskPhoneForLog).join('|') || 'none';
    return `${u.displayName || 'n/a'} tel=${u.telephoneNumber ? 'yes' : 'no'} lineUri=${u.lineUri || u.lineURI ? 'yes' : 'no'} phones=${candidates}`;
  }).join('; ');

  console.log(`[findTeamsUserByThaiName][diag] ${prefix} users=${users.length} withPhone=${withPhone} sample=[${sample}]`);
}

async function scanUsersByNameContains(
  graphClient: Client,
  query: string,
): Promise<EntraUserMatch[]> {
  const matches: EntraUserMatch[] = [];
  let nextLink: string | null = null;
  let pages = 0;

  do {
    const page = await queryGraphUsersPage(graphClient, nextLink ? { path: nextLink } : { top: 200 });
    pages += 1;

    for (const u of page.users) {
      if (userMatchesName(u, query)) {
        matches.push({
          displayName: u.displayName || '',
          userPrincipalName: u.userPrincipalName || '',
          phoneNumber: pickPhoneNumber(u),
        });
        if (matches.length > 10) break;
      }
    }

    if (matches.length > 10) break;
    nextLink = page.nextLink;
  } while (nextLink && pages < 20);

  return matches;
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
          const matchedPhone = findPhoneByLast4(u, query);
          if (matchedPhone) {
            extensionMatches.push({
              displayName: u.displayName || '',
              userPrincipalName: u.userPrincipalName || '',
              phoneNumber: matchedPhone,
            });
            if (extensionMatches.length > 1) break;
          }
        }

        if (extensionMatches.length > 1) break;
        nextLink = page.nextLink;
      } while (nextLink && pages < 20);

      if (extensionMatches.length > 0) {
        const matchedSummary = extensionMatches
          .map((m) => `${m.displayName}(${maskPhoneForLog(m.phoneNumber || '')})`)
          .join(', ');
        console.log(`[findTeamsUserByThaiName] Extension ${query} candidates: ${matchedSummary}`);
      }

      if (extensionMatches.length === 0) {
        const firstPage = await queryGraphUsersPage(graphClient, { top: 30 });
        logUserPhoneDiagnostics(`extension=${query} no-match`, firstPage.users);
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
      // Fallback scan: Graph startswith/filter can miss some localized names.
      const scannedMatches = await scanUsersByNameContains(graphClient, query);
      if (scannedMatches.length > 1) {
        console.log(`[findTeamsUserByThaiName] Fallback scan found ${scannedMatches.length} users for "${name}"`);
        return {
          upn: null,
          phoneNumber: null,
          transferTarget: null,
          matches: scannedMatches,
          isDuplicate: true,
        };
      }

      if (scannedMatches.length === 1) {
        const matched = scannedMatches[0];
        if (matched.phoneNumber) {
          entraIdCache.set(key, matched.phoneNumber);
          return {
            upn: matched.userPrincipalName || null,
            phoneNumber: matched.phoneNumber,
            transferTarget: matched.phoneNumber,
            matches: [matched],
            isDuplicate: false,
          };
        }
      }

      const firstPage = await queryGraphUsersPage(graphClient, { top: 30 });
      logUserPhoneDiagnostics(`name=${query} no-match`, firstPage.users);
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