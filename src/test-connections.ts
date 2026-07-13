import { ClientSecretCredential } from '@azure/identity';

/* ── Result type ──────────────────────────────────────────────────── */

export interface ConnectionTestResult {
  success: boolean;
  debugLogs: string[];
  errorMessage: string | null;
}

/* ── 1. OpenRouter ────────────────────────────────────────────────── */

/**
 * Sends a minimal (free) chat-completion request to the OpenRouter API
 * to verify that the given API key is active and the model is reachable.
 * Returns detailed step-by-step debug logs for the admin UI.
 */
export async function testOpenRouterConnection(
  apiKey: string,
  model: string,
): Promise<ConnectionTestResult> {
  const debugLogs: string[] = [];

  if (!apiKey.trim()) {
    debugLogs.push('❌ Pre-check: API key is empty — aborting.');
    return { success: false, debugLogs, errorMessage: 'API key is empty.' };
  }
  if (!model.trim()) {
    debugLogs.push('❌ Pre-check: Model ID is empty — aborting.');
    return { success: false, debugLogs, errorMessage: 'Model ID is empty.' };
  }

  debugLogs.push(`🔧 Step 1: Initiating OpenRouter payload handshake with model "${model}"...`);
  debugLogs.push(`📤 Step 2: Sending HTTP POST request to https://openrouter.ai/api/v1/chat/completions...`);

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/audiocodes/ac-bot-api',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with the word OK.' }],
          max_tokens: 20,
          temperature: 0,
        }),
      },
    );

    debugLogs.push(`📡 Step 3: Server responded with HTTP status ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body ? ` — ${body.slice(0, 200)}` : '';
      const errorMessage = `OpenRouter returned HTTP ${response.status}${detail}`;
      debugLogs.push(`❌ Step 4: ${errorMessage}`);
      return { success: false, debugLogs, errorMessage };
    }

    debugLogs.push('✅ Step 4: API key validated successfully — model is reachable.');
    return { success: true, debugLogs, errorMessage: null };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const errorMessage = `Network error: ${msg}`;
    debugLogs.push(`💥 Step 4: ${errorMessage}`);
    return { success: false, debugLogs, errorMessage };
  }
}

/* ── 2. Azure AD ──────────────────────────────────────────────────── */

/**
 * Attempts to acquire an access token from Microsoft Entra ID using the
 * provided credentials. A successful token acquisition confirms that all
 * three values (tenantId, clientId, clientSecret) are correct.
 * Returns detailed step-by-step debug logs for the admin UI.
 */
export async function testAzureAdConnection(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<ConnectionTestResult> {
  const debugLogs: string[] = [];

  if (!tenantId.trim()) {
    debugLogs.push('❌ Pre-check: Tenant ID is empty — aborting.');
    return { success: false, debugLogs, errorMessage: 'Tenant ID is empty.' };
  }
  if (!clientId.trim()) {
    debugLogs.push('❌ Pre-check: Client ID is empty — aborting.');
    return { success: false, debugLogs, errorMessage: 'Client ID is empty.' };
  }
  if (!clientSecret.trim()) {
    debugLogs.push('❌ Pre-check: Client secret is empty — aborting.');
    return { success: false, debugLogs, errorMessage: 'Client secret is empty.' };
  }

  debugLogs.push('🔧 Step 1: Connecting to Microsoft Entra ID Token Endpoint via @azure/identity...');
  debugLogs.push('🔑 Step 2: Requesting access token scopes for https://graph.microsoft.com/.default...');

  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    const tokenResponse = await credential.getToken(
      'https://graph.microsoft.com/.default',
    );

    debugLogs.push('📡 Step 3: Token endpoint responded.');

    if (!tokenResponse?.token) {
      const errorMessage = 'Azure AD returned an empty token.';
      debugLogs.push(`❌ Step 4: ${errorMessage}`);
      return { success: false, debugLogs, errorMessage };
    }

    debugLogs.push('✅ Step 4: Access token acquired successfully — credentials are valid.');
    debugLogs.push('   ● Token type: Bearer');
    debugLogs.push(`   ● Expires: ${tokenResponse.expiresOnTimestamp ? new Date(tokenResponse.expiresOnTimestamp * 1000).toISOString() : 'unknown'}`);
    return { success: true, debugLogs, errorMessage: null };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    let errorMessage = `Azure AD authentication failed: ${msg}`;

    // Extract specific MSAL error codes
    if (msg.includes('AADSTS7000222')) {
      errorMessage = '❌ Client secret has expired. Generate a new one in Azure Portal → App Registrations → Certificates & Secrets.';
    } else if (msg.includes('AADSTS700016')) {
      errorMessage = '❌ Client ID (Application ID) not found in the specified tenant. Verify the Tenant ID and Client ID.';
    } else if (msg.includes('AADSTS50034')) {
      errorMessage = '❌ Tenant ID is invalid or does not exist.';
    } else if (msg.includes('invalid_client')) {
      errorMessage = '❌ Invalid client credentials. Check your Client ID and Client Secret.';
    } else if (msg.includes('unauthorized_client')) {
      errorMessage = '❌ The application does not have the required permissions. Grant admin consent in Azure Portal.';
    }

    debugLogs.push(`💥 Step 3: ${errorMessage}`);
    return { success: false, debugLogs, errorMessage };
  }
}