export interface ConfigFormState {
  // AudioCodes
  webhookSecret: string;
  welcomeMessage: string;
  fallbackMessage: string;
  fallbackDestination: string;
  maxRetries: number;

  // OpenRouter
  openRouterApiKey: string;
  aiModelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;

  // Azure AD
  tenantId: string;
  clientId: string;
  clientSecret: string;
  secretExpiryDate: string;
  searchScope: string;
  mfaEnabled: boolean;
  mfaAllowedDomain: string;
  speechKey: string;
  speechRegion: string;
  webhookPublicUrl: string;

  // SIP / Routing
  sipDomain: string;
  sbcPort: number;
  transferProtocol: string;
  routingMode: string;
  transferTimeout: number;
  maxMatchResults: number;
  fallbackMappings?: FallbackContactMapping[];
  operatorFallbackSip: string;
  departments?: DepartmentEntry[];
}

export interface FallbackContactMapping {
  name?: string;
  aliases?: string[];
  upn?: string;
  extension?: string;
  lineURI?: string;
  phone: string;
}

export interface DepartmentEntry {
  name: string;
  sipUri: string;
  aliases: string[];
}

export const DEFAULTS: ConfigFormState = {
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
  fallbackMappings: [],
  operatorFallbackSip: 'sip:operator-queue@company.com',
};

export interface ValidationErrors {
  [key: string]: string | undefined;
}

export function validate(form: ConfigFormState): ValidationErrors {
  const e: ValidationErrors = {};

  if (!form.welcomeMessage.trim()) e.welcomeMessage = 'Welcome message is required';
  if (!form.fallbackMessage.trim()) e.fallbackMessage = 'Fallback message is required';

  if (!form.aiModelId.trim()) e.aiModelId = 'Model ID is required';

  if (!form.sipDomain.trim()) e.sipDomain = 'SIP domain is required';
  if (form.maxMatchResults < 1) e.maxMatchResults = 'Must be at least 1';
  if (form.maxRetries < 1) e.maxRetries = 'Must be at least 1';

  return e;
}