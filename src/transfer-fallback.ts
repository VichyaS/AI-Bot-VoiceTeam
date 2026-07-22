import { BotActivity, BotActivityEventName, BotActivityType } from './websocket/types.js';
import { getConfig } from './config-manager.js';
import { emitTransfer, emitInfo } from './system-logger.js';
import { cleanTextForThaiTts } from './tts-cleaner.js';

function getFallbackPrompt(): string {
  const cfg = getConfig();
  return cfg.busyPrompt || 'ขออภัยค่ะ สายปลายทางไม่สะดวกรับสาย';
}

/**
 * Generates a fallback AudioCodes response when a transfer attempt fails
 * (busy, rejected, timeout, user offline on Teams).
 *
 * The response plays a soothing TTS prompt to the caller, then issues a
 * new 'transfer' action pointing to the central operator SIP URI from
 * `config.operatorFallbackSip`.
 *
 * @param reason - Optional reason for the failure (for logging).
 * @returns An AudioCodes response object with activities array.
 */
export function generateTransferFallbackResponse(
  reason?: string,
): { activities: BotActivity[] } {
  const cfg = getConfig();
  const operatorSip = cfg.operatorFallbackSip || 'sip:operator-queue@company.com';

  // Strip sip: prefix if present — generateTransferResponse adds it
  const target = operatorSip.replace(/^sip:/iu, '');

  emitInfo(`Transfer failed${reason ? `: ${reason}` : ''}. Routing to operator: ${operatorSip}`);
  emitTransfer(`Fallback transfer to operator queue: ${target}`);

  // 1. TTS prompt to soothe the caller
  const promptActivity: BotActivity = {
    type: BotActivityType.message,
    text: cleanTextForThaiTts(getFallbackPrompt()),
  };

  // 2. Transfer event to central operator
  const transferActivity: BotActivity = {
    type: BotActivityType.event,
    name: BotActivityEventName.transfer,
    parameters: {
      target: operatorSip,
    },
  };

  return {
    activities: [promptActivity, transferActivity],
  };
}