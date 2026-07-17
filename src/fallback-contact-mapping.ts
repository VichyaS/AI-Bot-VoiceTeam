import { getConfig } from './config-manager.js';
import { normalizePhoneForTransfer } from './graph-user.js';
import type { FallbackContactMapping } from './config-types.js';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/^คุณ/iu, '').replace(/\s+/gu, '');
}

function extractExtensionFromLineUri(lineUri: string): string | null {
  const extMatch = lineUri.match(/(?:^|[;?])ext=([^;?]+)/iu);
  if (extMatch?.[1]) {
    return extMatch[1].replace(/\D/gu, '');
  }

  const normalizedPhone = normalizePhoneForTransfer(lineUri);
  if (!normalizedPhone) return null;
  const digits = normalizedPhone.replace(/\D/gu, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function mappingToPhone(mapping: FallbackContactMapping): string | null {
  return normalizePhoneForTransfer(mapping.phone) || normalizePhoneForTransfer(mapping.lineURI);
}

export function resolveFallbackMappedPhone(params: {
  name?: string;
  upn?: string;
  extension?: string;
}): string | null {
  const mappings = getConfig().fallbackMappings || [];
  if (mappings.length === 0) return null;

  const wantedName = params.name ? normalizeText(params.name) : '';
  const wantedUpn = params.upn ? params.upn.trim().toLowerCase() : '';
  const wantedExtension = params.extension ? params.extension.replace(/\D/gu, '') : '';

  for (const mapping of mappings) {
    const mappedPhone = mappingToPhone(mapping);
    if (!mappedPhone) continue;

    if (wantedUpn && mapping.upn && mapping.upn.trim().toLowerCase() === wantedUpn) {
      return mappedPhone;
    }

    if (wantedName && mapping.name && normalizeText(mapping.name) === wantedName) {
      return mappedPhone;
    }

    if (wantedExtension) {
      const mappedExt = mapping.extension
        ? mapping.extension.replace(/\D/gu, '')
        : (mapping.lineURI ? extractExtensionFromLineUri(mapping.lineURI) : null);

      if (mappedExt && mappedExt === wantedExtension) {
        return mappedPhone;
      }
    }
  }

  return null;
}
