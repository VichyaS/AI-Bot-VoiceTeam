import { BotActivity, BotActivityEventName, BotActivityType } from './websocket/types.js';
import { cleanTextForThaiTts } from './tts-cleaner.js';
import { getConfig } from './config-manager.js';

/**
 * Builds a SIP URI with optional port and transport parameters.
 * Example: sip:somchai@company.com:5061
 */
function buildSipUri(target: string): string {
  const cfg = getConfig();
  const domain = cfg.sipDomain?.replace(/^sip:/iu, '') || 'company.com';
  const port = cfg.sbcPort || 5061;
  const normalizedTarget = target
    .replace(/^sip:/iu, '')
    .replace(/;transport=[^;>]+/iu, '')
    .trim();

  // If target already has a host, keep it and ensure signaling port exists.
  if (normalizedTarget.includes('@')) {
    const hasPort = /@[^;:>]+:\d+/u.test(normalizedTarget);
    return hasPort
      ? `sip:${normalizedTarget}`
      : `sip:${normalizedTarget}:${port}`;
  }

  // E.164 numbers should go to Microsoft's PSTN hub for Teams routing.
  const targetDomain = normalizedTarget.startsWith('+')
    ? 'sip.pstnhub.microsoft.com'
    : domain;

  return `sip:${normalizedTarget}@${targetDomain}:${port}`;
}

/**
 * Generates a valid AudioCodes VoiceAI Connect transfer activity response object.
 *
 * @param targetUpn - The userPrincipalName of the target (e.g. "somchai@contoso.com").
 * @param promptText - Optional fallback TTS prompt to play before transferring.
 * @returns An object with `activities` array containing the transfer event and a
 *          preceding TTS prompt message.
 */
export function generateTransferResponse(
  targetUpn: string,
  promptText?: string,
  callerName?: string,
): { activities: BotActivity[] } {
  const cfg = getConfig();
  const isConsultative = cfg.routingMode === 'Consultative Transfer';

  const fallbackPrompt = isConsultative
    ? 'กรุณารอสักครู่ กำลังติดต่อผู้รับสายค่ะ'
    : (promptText || 'กำลังโอนสายไปยังผู้รับสายค่ะ');

  // Build the SIP URI with port and transport
  const sipUri = buildSipUri(targetUpn);

  // 1. A TTS message to play before the transfer
  const promptActivity: BotActivity = {
    type: BotActivityType.message,
    text: cleanTextForThaiTts(fallbackPrompt),
  };

  // 2. The transfer event with the SIP target in parameters
  //    Always use Blind Transfer — VoiceAI Connect handles the actual call.
  //    When consultative mode is on, the webhook handles transfer failure
  //    events (busy/timeout/reject) and plays "สายไม่ว่าง" TTS + fallback.
  const transferActivity: BotActivity = {
    type: BotActivityType.event,
    name: BotActivityEventName.transfer,
    parameters: {
      target: sipUri,
      routingMode: 'Blind Transfer',
    },
  };

  return {
    activities: [promptActivity, transferActivity],
  };
}