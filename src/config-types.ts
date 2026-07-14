import type { DepartmentEntry } from './services/routing-types.js';

/**
 * Shared configuration schema matching the admin dashboard form.
 */
export interface AppConfig {
  webhookSecret: string;
  welcomeMessage: string;
  fallbackMessage: string;
  /** Fallback destination (SIP URI or phone number) for automatic transfer */
  fallbackDestination: string;
  /** Max consecutive failed routing attempts before fallback transfer */
  maxRetries: number;
  openRouterApiKey: string;
  aiModelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** ISO date string for when the Azure client secret expires */
  secretExpiryDate?: string;
  /** Optional domain filter for user search (e.g. @company.com) */
  searchScope?: string;
  /** Enable Microsoft Entra ID login with MFA for the admin dashboard */
  mfaEnabled: boolean;
  /** Allowed email domain for MFA login (e.g. company.com) */
  mfaAllowedDomain: string;
  /** Azure Speech Services key for ASR */
  speechKey: string;
  /** Azure Speech Services region */
  speechRegion: string;
  /** Public URL for the webhook (for VoiceAI connection test) */
  webhookPublicUrl: string;
  sipDomain: string;
  /** SBC signaling port (default 5061) */
  sbcPort: number;
  /** Transfer protocol: TLS, TCP, or UDP */
  transferProtocol: string;
  /** Call routing mode: Blind Transfer or Consultative Transfer */
  routingMode: string;
  /** Max seconds to wait for transfer success before fallback */
  transferTimeout: number;
  maxMatchResults: number;
  /** SIP URI for the central operator / call queue when a transfer fails */
  operatorFallbackSip?: string;
  /** Department routing table — editable by admins via the dashboard */
  departments?: DepartmentEntry[];
}

export const DEFAULT_CONFIG: AppConfig = {
  webhookSecret: '',
  welcomeMessage: 'สวัสดีค่ะ ต้องการติดต่อใครคะ?',
  fallbackMessage: 'ขออภัยค่ะ ไม่พบชื่อนี้ในระบบ กรุณาลองใหม่อีกครั้ง',
  fallbackDestination: 'sip:operator-queue@company.com',
  maxRetries: 3,
  openRouterApiKey: '',
  aiModelId: 'openai/gpt-4o-mini',
  systemPrompt: '',
  temperature: 0,
  maxTokens: 150,
  topP: 1,
  tenantId: '',
  clientId: '',
  clientSecret: '',
  secretExpiryDate: '',
  searchScope: '',
  mfaEnabled: false,
  mfaAllowedDomain: '',
  speechKey: '',
  speechRegion: '',
  webhookPublicUrl: '',
  sipDomain: 'sip:company.com',
  sbcPort: 5061,
  transferProtocol: 'TLS',
  routingMode: 'Blind Transfer',
  transferTimeout: 15,
  maxMatchResults: 1,
  operatorFallbackSip: 'sip:operator-queue@company.com',
};

/**
 * The set of keys whose values are considered sensitive and should be
 * masked in GET responses and preserved in POST if the submitted value
 * is still the masked placeholder.
 */
export const SECRET_KEYS = new Set([
  'webhookSecret',
  'openRouterApiKey',
  'clientSecret',
]);

/**
 * Returns a copy of config where sensitive fields show only the first 3
 * characters followed by asterisks (e.g. `sk-*****`).
 */
export function maskSecrets(config: AppConfig): AppConfig {
  const masked = { ...config };
  for (const key of SECRET_KEYS) {
    const val = masked[key as keyof AppConfig] as string;
    if (val.length > 3) {
      (masked as any)[key] = val.slice(0, 3) + '*'.repeat(val.length - 3);
    } else if (val.length > 0) {
      (masked as any)[key] = '*'.repeat(val.length);
    }
    // if empty, leave empty
  }
  return masked;
}

/**
 * Returns true if `value` looks like a masked placeholder produced by
 * `maskSecrets` for the given `originalSecret`.
 */
export function isMaskedPlaceholder(value: string, originalSecret: string): boolean {
  if (!originalSecret || !value) return false;
  if (value.length !== originalSecret.length) return false;
  // Check: first 3 chars match, rest are '*'
  if (value.slice(0, 3) !== originalSecret.slice(0, 3)) return false;
  for (let i = 3; i < value.length; i++) {
    if (value[i] !== '*') return false;
  }
  return true;
}