import { getConfig } from './config-manager.js';
import { normalizePhoneForTransfer } from './graph-user.js';
import type { FallbackContactMapping } from './config-types.js';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/^คุณ/iu, '').replace(/\s+/gu, '');
}

function splitAliases(aliases: string[] | undefined): string[] {
  return (aliases || [])
    .flatMap((alias) => alias.split(/[|,;]/u))
    .map((alias) => alias.trim())
    .filter(Boolean);
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

export function resolveFallbackMappedPhone(params: { name?: string; upn?: string; extension?: string }): string | null {
  const candidates = findFallbackMappingCandidates(params);
  return candidates.length > 0 ? candidates[0].phone : null;
}

/**
 * Returns ALL matching fallback mapping entries for duplicate-name detection.
 * Each result includes the display name and phone — useful when the caller
 * needs to choose between multiple people with the same name.
 */
export interface FallbackMappingCandidate {
  name: string;
  phone: string;
}

export function findFallbackMappingCandidates(params: {
  name?: string;
  upn?: string;
  extension?: string;
}): FallbackMappingCandidate[] {
  const mappings = getConfig().fallbackMappings || [];
  if (mappings.length === 0) return [];

  const wantedName = params.name ? normalizeText(params.name) : '';
  const wantedUpn = params.upn ? params.upn.trim().toLowerCase() : '';
  const wantedExtension = params.extension ? params.extension.replace(/\D/gu, '') : '';
  const results: FallbackMappingCandidate[] = [];

  for (const mapping of mappings) {
    const mappedPhone = mappingToPhone(mapping);
    if (!mappedPhone) continue;

    const mappingNames = [mapping.name, ...splitAliases(mapping.aliases)].filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );

    let matched = false;
    if (wantedUpn && mapping.upn && mapping.upn.trim().toLowerCase() === wantedUpn) {
      matched = true;
    } else if (wantedName && mappingNames.some((candidate) => normalizeText(candidate) === wantedName)) {
      matched = true;
    } else if (wantedExtension) {
      const mappedExt = mapping.extension
        ? mapping.extension.replace(/\D/gu, '')
        : (mapping.lineURI ? extractExtensionFromLineUri(mapping.lineURI) : null);
      if (mappedExt && mappedExt === wantedExtension) matched = true;
    }

    if (matched) {
      results.push({ name: mapping.name || mapping.upn || '', phone: mappedPhone });
    }
  }

  return results;
}
