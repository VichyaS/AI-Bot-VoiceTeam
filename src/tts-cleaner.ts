/**
 * Optimizes Thai text for Text-to-Speech (TTS) rendering via AudioCodes.
 *
 * The synthetic voice often stutters or spells out characters when encountering
 * mixed Thai-English text, bare digits, or run-together words. This module
 * cleans the input to produce a natural, flowing TTS output.
 */

/* ── Compiled regex patterns (one-time) ───────────────────────────── */

// English/ASCII word boundaries inside Thai sentences
// e.g. "ฝ่ายIT" → "ฝ่าย ไอที", "เบอร์101" → "เบอร์ 1 0 1"
const EN_INSIDE_THAI = /([\u0E00-\u0E7F]+)([a-zA-Z0-9]+)/gu;
const THAI_INSIDE_EN = /([a-zA-Z0-9]+)([\u0E00-\u0E7F]+)/gu;

// Consecutive digits — split into individual characters for clarity
// e.g. "101" → "1 0 1" so TTS says "หนึ่ง ศูนย์ หนึ่ง" not "หนึ่งร้อยหนึ่ง"
const CONSECUTIVE_DIGITS = /(\d{2,})/g;

// English acronyms/words embedded in Thai — spell them phonetically
// e.g. "IT" → "ไอที", "HR" → "เอชอาร์"
const EN_WORD_BOUNDARY = /(?<=[\u0E00-\u0E7F\s]|^)([A-Za-z]{2,})(?=[\u0E00-\u0E7F\s]|$)/g;

// Known tech/business acronyms and their Thai phonetic equivalents
const ACRONYM_MAP: Record<string, string> = {
  'IT': 'ไอที',
  'HR': 'เอชอาร์',
  'SIP': 'เอสไอพี',
  'API': 'เอพีไอ',
  'AI': 'เอไอ',
  'URL': 'ยูอาร์แอล',
  'DNS': 'ดีเอ็นเอส',
  'VPN': 'วีพีเอ็น',
  'ID': 'ไอดี',
  'UPN': 'ยูพีเอ็น',
  'SBC': 'เอสบีซี',
  'PSTN': 'พีเอสทีเอ็น',
  'IVR': 'ไอวีอาร์',
  'TTS': 'ทีทีเอส',
};

/* ── Main function ────────────────────────────────────────────────── */

/**
 * Cleans and optimizes a Thai text string for natural-sounding TTS output.
 *
 * Transformations applied:
 *   1. Strip leading/trailing whitespace
 *   2. Replace English acronyms with Thai phonetic equivalents
 *   3. Split consecutive digits into space-separated characters
 *   4. Inject spacing between Thai and English segments
 *   5. Collapse multiple spaces
 *
 * @param text - Raw TTS prompt (mixed Thai/English/numbers)
 * @returns Cleaned text ready for AudioCodes playTextMessage
 */
export function cleanTextForThaiTts(text: string): string {
  if (!text) return '';

  let result = text.trim();

  // 1. Replace known English acronyms with Thai pronunciation
  result = result.replace(EN_WORD_BOUNDARY, (match) => {
    const upper = match.toUpperCase();
    return ACRONYM_MAP[upper] || match;
  });

  // 2. Split consecutive digits into individual characters
  //    "101" → "1 0 1", "เบอร์101" → "เบอร์1 0 1"
  result = result.replace(CONSECUTIVE_DIGITS, (digits) => {
    return digits.split('').join(' ');
  });

  // 3. Inject space between Thai text and adjacent English/number blocks
  //    "ฝ่ายIT" → "ฝ่าย ไอที"
  result = result.replace(EN_INSIDE_THAI, '$1 $2');
  result = result.replace(THAI_INSIDE_EN, '$1 $2');

  // 4. Collapse multiple spaces into one
  result = result.replace(/\s{2,}/g, ' ');

  // 5. Ensure sentence ends with proper punctuation for TTS pause
  if (!/[.!?]\s*$/.test(result) && !result.endsWith('ค่ะ') && !result.endsWith('ครับ')) {
    result = result + 'ค่ะ';
  }

  return result.trim();
}

/**
 * Wraps text in SSML prosody tags to slow down speech rate for natural pacing.
 * The AudioCodes VoiceAI Connect supports limited SSML — this wraps the
 * entire prompt so names and numbers are spoken at a comfortable pace.
 */
export function wrapWithSsml(text: string): string {
  return `<speak><prosody rate="slow">${text}</prosody></speak>`;
}

/**
 * Formats an extension number for TTS clarity.
 * e.g. "101" → "เบอร์ 1 0 1"
 */
export function formatExtensionForTts(ext: string): string {
  const digits = ext.replace(/\D/g, '').split('').join(' ');
  return `เบอร์ ${digits}`;
}

/**
 * Formats a department name with Thai prefix for natural TTS pacing.
 * e.g. "ฝ่ายบัญชี" → "ฝ่าย บัญชี", "IT" → "แผนก ไอที"
 */
export function formatDepartmentForTts(deptName: string): string {
  const cleaned = cleanTextForThaiTts(deptName);
  if (/^(ฝ่าย|แผนก|ส่วน)/u.test(cleaned)) return cleaned;
  return `แผนก ${cleaned}`;
}