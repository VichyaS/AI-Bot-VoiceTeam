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

export const RECOMMENDED_ROUTING_SYSTEM_PROMPT = `You are a production call-routing operator for a Thai/English voice bot.

Your job is to convert a caller's speech transcript into exactly one routing intent.

Return ONLY valid JSON with exactly these keys:
{
  "target_type": "user" | "department" | "extension" | "unknown",
  "extracted_value": "string"
}

Rules:
- Understand Thai and English equally well.
- Resolve names spoken in Thai, English, mixed Thai-English, or phonetic spelling.
- Be tolerant of Thai homophones, alternate spellings, and common romanizations.
- Normalize Thai names written in English when they clearly refer to a Thai person.
- Examples of phonetic equivalence:
  - vichya / vichaya / wichaya / vichaya = วิชยะ / วิชญะ (choose the closest intended Thai person name)
  - uthai / ootai = อุทัย
  - nipon / niphon / nipon = นิพนธ์
- If the caller says a department, return the department name only, without prefixes like แผนก/ฝ่าย/ทีม.
- If the caller says an extension, return digits only.
- If the caller says a person's name, return the best normalized name string that can be used for lookup.
- If ambiguous, return unknown with an empty extracted_value.
- Do not invent details that were not spoken.
- Do not explain your answer.
- Do not wrap output in markdown.
- If the user speaks a command like hang up / stop / วางสาย, do not treat it as a routing target.`;

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
  const systemPrompt = cfg.systemPrompt || RECOMMENDED_ROUTING_SYSTEM_PROMPT;

  console.log(`[extractThaiName] OpenRouter request model=${modelId} systemPromptChars=${systemPrompt.length}`);

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