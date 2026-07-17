export interface RoutingIntent {
  target_type: string;
  extracted_value: string;
}

export function isFailedRouting(intent: RoutingIntent | null): boolean {
  return !intent || intent.target_type === 'unknown' || intent.target_type === 'error';
}

export function inferRoutingFromSpeech(
  aiResult: RoutingIntent | null,
  spokenTextRaw: string,
): RoutingIntent | null {
  const spokenText = spokenTextRaw.trim();
  if (!isFailedRouting(aiResult)) return aiResult;

  if (/^\d{4}$/u.test(spokenText)) {
    return { target_type: 'extension', extracted_value: spokenText };
  }

  if (/\p{L}/u.test(spokenText)) {
    return { target_type: 'user', extracted_value: spokenText };
  }

  return aiResult;
}
