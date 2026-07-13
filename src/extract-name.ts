import { getConfig } from './config-manager.js';
import { broadcastSystemAlert } from './system-logger.js';
import https from 'node:https';

// Reusable HTTPS agent with Keep-Alive — avoids SSL handshake per request
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 25 });

/**
 * Simple async processing queue that limits concurrency to prevent
 * event-loop blocking under high traffic.
 */
class AsyncQueue {
  private pending: (() => Promise<void>)[] = [];
  private active = 0;
  constructor(private concurrency: number) {}

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.active++;
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally {
          this.active--;
          this.dequeue();
        }
      };
      this.pending.push(run);
      this.dequeue();
    });
  }

  private dequeue() {
    if (this.active >= this.concurrency || this.pending.length === 0) return;
    const next = this.pending.shift()!;
    next();
  }
}

/** Global AI inference queue — max 5 concurrent OpenRouter requests */
const aiQueue = new AsyncQueue(5);

/**
 * Structured result from the AI name extractor.
 */
export interface AiExtractionResult {
  target_type: 'extension' | 'user' | 'department' | 'unknown';
  extracted_value: string;
}

/**
 * Extracts a Thai person's name, extension, or department from speech via OpenRouter.
 * Returns a structured JSON result parsed from the LLM response.
 *
 * @param userSpeech - The Thai speech text from the user
 * @returns Structured result, or null if the API call fails
 */
export async function extractThaiName(
  userSpeech: string,
): Promise<AiExtractionResult | null> {
  const cfg = getConfig();
  const apiKey = cfg.openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
  const modelId = cfg.aiModelId || 'meta-llama/llama-3-70b-instruct';
  const systemPrompt = cfg.systemPrompt || `You are a strict Thai IVR routing assistant. Your task is to parse the user's speech and determine the target they want to reach.

Respond with ONLY a valid JSON object — no explanation, no markdown, no extra text.

The JSON must have exactly two fields:
1. "target_type": one of "extension", "user", "department", or "unknown"
2. "extracted_value": the extracted identifier as a string

Rules:
- If the user mentions an extension number (e.g., "ต่อ 1234", "เบอร์ 5678", "1234"), return {"target_type": "extension", "extracted_value": "1234"}
- If the user mentions a person's name (e.g., "คุณสมชาย", "ต่อโต๊ะสมชาย", "สมชาย"), return {"target_type": "user", "extracted_value": "สมชาย"}
- If the user mentions a department (e.g., "ฝ่ายบัญชี", "แผนกไอที", "การตลาด"), return {"target_type": "department", "extracted_value": "ฝ่ายบัญชี"}
- If unclear, return {"target_type": "unknown", "extracted_value": ""}`;

  if (!apiKey) {
    console.error('[extractThaiName] OpenRouter API key is not configured.');
    return null;
  }

  if (!userSpeech || userSpeech.trim().length === 0) {
    return null;
  }

  // Queue the API call through the async queue (max 5 concurrent)
  const response = await aiQueue.enqueue(async () => {
    return fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        // @ts-ignore - node https agent is compatible with fetch
        agent: keepAliveAgent,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/audiocodes/ac-bot-api',
          'Connection': 'keep-alive',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userSpeech },
          ],
          max_tokens: cfg.maxTokens || 150,
          temperature: cfg.temperature ?? 0,
          top_p: cfg.topP ?? 1,
        }),
      },
    );
  });

  if (!response.ok) {
    const status = response.status;
    console.error(`[extractThaiName] OpenRouter API error: ${status}`);

    // Trigger CRITICAL alerts for auth failure (401/403) and rate-limit (429)
    if (status === 401 || status === 403) {
      broadcastSystemAlert('CRITICAL', `OpenRouter API authentication failed (HTTP ${status}). Check your API key.`);
    } else if (status === 429) {
      broadcastSystemAlert('CRITICAL', 'OpenRouter API rate limit exceeded (HTTP 429). Throttling requests.');
    }
    return null;
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices?.[0]?.message?.content?.trim() ?? '';

  if (!content) return null;

  // Try to parse the JSON response
  try {
    const parsed = JSON.parse(content) as AiExtractionResult;

    if (!['extension', 'user', 'department', 'unknown'].includes(parsed.target_type)) {
      console.warn('[extractThaiName] Unknown target_type from AI:', parsed.target_type);
      return { target_type: 'unknown', extracted_value: '' };
    }

    return {
      target_type: parsed.target_type,
      extracted_value: parsed.extracted_value || '',
    };
  } catch {
    console.warn('[extractThaiName] Failed to parse AI JSON response:', content);
    return { target_type: 'unknown', extracted_value: '' };
  }
}