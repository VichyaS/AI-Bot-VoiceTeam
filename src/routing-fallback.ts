export interface RoutingIntent {
  target_type: string;
  extracted_value: string;
}

const FORCE_HANGUP_PATTERNS = [
  /^วางสาย$/u,
  /^ไม่ติดต่อแล้ว$/u,
  /^ไม่ติดต่อแล้วให้โอนสายไป operator$/u,
  /^ยกเลิก$/u,
];

export function shouldForceHangup(spokenTextRaw: string): boolean {
  const spokenText = spokenTextRaw.trim().toLowerCase();
  return FORCE_HANGUP_PATTERNS.some((pattern) => pattern.test(spokenText));
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
