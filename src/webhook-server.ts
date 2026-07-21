import express, { type Request, type Response } from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  BotActivity,
  BotActivityEventName,
  BotActivityType,
} from './websocket/types.js';
import { extractThaiName } from './extract-name.js';
import { findTeamsUserByThaiName, formatDuplicateUserChoicesForThaiTts } from './graph-user.js';
import { getDepartmentSipUri } from './department-lookup.js';
import { generateTransferResponse } from './transfer.js';
import { generateTransferFallbackResponse } from './transfer-fallback.js';
import { getConfig } from './config-manager.js';
import adminRouter from './admin-router.js';
import authRouter from './auth-router.js';
import unhandledRouter from './unhandled-router.js';
import departmentRouter from './department-router.js';
import testRouteRouter from './test-route-router.js';
import usersRouter from './users-router.js';
import mfaRouter from './mfa-router.js';
import { createLogWebSocketServer } from './ws-server.js';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { emitInfo, emitAi, emitEntraId, emitTransfer, emitError, emitCallEvent } from './system-logger.js';
import { logUnhandledIntent } from './unhandled-intents.js';
import { cleanTextForThaiTts } from './tts-cleaner.js';
import { getRetryCount, incrementRetry, resetRetry } from './retry-counter.js';
import { inferRoutingFromSpeech, isFailedRouting, shouldForceHangup } from './routing-fallback.js';
import { resolveFallbackMappedPhone, findFallbackMappingCandidates } from './fallback-contact-mapping.js';
import { VoiceAiAsrProcessor } from './speech-asr.js';
import { SipMediaEndpoint } from './sip-endpoint.js';
import { logCallStart, logCallEnd, logCallRouting } from './call-stats.js';
import callStatsRouter from './call-stats-router.js';

// ── Global startup error handler ────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception during startup:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] Unhandled rejection during startup:', err);
});

// ── Start-up checks ────────────────────────────────────────────────
function checkSecretExpiry() {
  const cfg = getConfig();
  if (!cfg.secretExpiryDate) return;
  const expiry = new Date(cfg.secretExpiryDate);
  const now = new Date();
  const daysRemaining = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    emitInfo('[WARNING] Azure Client Secret has expired. Renew immediately.');
  } else if (daysRemaining <= 30) {
    emitInfo(`[WARNING] Azure Client Secret will expire soon (${daysRemaining} days remaining). Renew before expiry.`);
  }
}
checkSecretExpiry();
// Re-check every 6 hours
setInterval(checkSecretExpiry, 6 * 60 * 60 * 1000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// ── Healthcheck endpoint (prevents Render spin-down) ────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve built admin dashboard (production) ────────────────────────
const dashboardDist = path.resolve(__dirname, '..', 'admin-dashboard', 'dist');
if (fs.existsSync(dashboardDist)) {
  console.log(`[webhook] Serving admin dashboard from ${dashboardDist}`);
  app.use(express.static(dashboardDist, {
    setHeaders: (res) => {
      // Prevent clients from serving stale dashboard bundles after deployments.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }));
}

// ── Security middleware ─────────────────────────────────────────────
app.use(helmet({
  hidePoweredBy: true,   // Remove X-Powered-By header
  contentSecurityPolicy: false, // Allow inline styles for Tailwind
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

// Trust proxy — required for reverse proxies and load balancers
// Set to 1 so only the first hop (the load balancer) is trusted,
// preventing IP-based rate-limit bypass.
app.set('trust proxy', 1);

// Create a single HTTP server manually so we can attach WebSocket
const httpServer = createServer(app);

// Attach WebSocket server (noServer mode using HTTP upgrade)
createLogWebSocketServer(httpServer);

// ── AudioCodes Bot API WebSocket Server ────────────────────────────
// This WebSocket endpoint handles the VoiceAI Connect internal protocol.
// SBC sends {"message":"Start",...} not the standard Bot API protocol.
const botWsPath = '/api/audiocodes/bot-ws';

const botWsServer = new WebSocketServer({ noServer: true });

// Map sessionId → ASR processor
const asrProcessors = new Map<string, VoiceAiAsrProcessor>();

botWsServer.on('connection', (ws: WsSocket, req) => {
  console.log('[bot-ws] VoiceAI WebSocket client connected');

  ws.on('message', (data) => {
    // ── Handle binary audio data from SBC ─────────────────────────
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      const audioBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      // Find the current session's ASR processor and feed audio
      // For simplicity, use the last active session
      const lastSessionId = asrProcessors.keys().next().value;
      if (lastSessionId) {
        const processor = asrProcessors.get(lastSessionId);
        if (processor) {
          processor.feedAudio(audioBuf);
        }
      }
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      console.log('[bot-ws] Received:', msg.message || msg.type);

      if (msg.message === 'Start') {
        const sessionId = msg.sessionID || 'unknown';
        const caller = msg.caller || 'unknown';
        console.log(`[bot-ws] ✅ Received Start: session=${sessionId}, caller=${caller}`);
        emitCallEvent('call-started', sessionId, caller);
        logCallStart(sessionId, caller, 'sip-user');
        emitInfo(`Incoming call from ${caller}`);
        emitInfo(`[DEBUG] Media formats: ${(msg.mediaFormats || []).join(', ')}`);

        // ── Respond to SBC to acknowledge Start ───────────────────
        // SBC needs a response to proceed. Send selected media format.
        const selectedFormat = (msg.mediaFormats || []).includes('raw/lpcm16_8') ? 'raw/lpcm16_8' : 'raw/mulaw';
        const response = JSON.stringify({
          message: 'sessionAccepted',
          sessionID: sessionId,
          mediaFormat: selectedFormat,
        });
        console.log(`[bot-ws] Sending response: ${response}`);
        ws.send(response, (err: any) => {
          if (err) console.error('[bot-ws] Error sending sessionAccepted:', err.message);
          else console.log('[bot-ws] ✅ sessionAccepted sent successfully');
        });
        emitInfo(`[WS] Sent sessionAccepted`);

        // Start ASR for this session
        const cfg = getConfig();
        if (cfg.speechKey && cfg.speechRegion) {
          const processor = new VoiceAiAsrProcessor(
            sessionId,
            cfg.speechKey,
            cfg.speechRegion,
            (text) => {
              // ASR recognized text — process via webhook
              emitAi(`User said: "${text}"`);
              fetch(`http://localhost:${PORT}/api/audiocodes/webhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'activities',
                  conversationId: sessionId,
                  caller: caller,
                  activities: [{ type: 'message', text }],
                }),
              })
                .then((res) => res.json())
                .then((response: any) => {
                  if (response.activities) {
                    for (const activity of response.activities) {
                      if (activity.type === 'message' && activity.text) {
                        emitInfo(`Bot response: "${activity.text}"`);
                      }
                      if (activity.type === 'event' && activity.name === 'transfer') {
                        emitTransfer(`Transfer to: ${activity.parameters?.target || ''}`);
                      }
                    }
                  }
                })
                .catch((err) => console.error('[bot-ws] Webhook error:', err));
            },
            (err) => {
              emitError(`ASR error: ${err.message}`);
            },
          );
          asrProcessors.set(sessionId, processor);
          emitInfo(`[ASR] Started Azure Speech recognition for session ${sessionId}`);
        } else {
          emitInfo(`[ASR] Speech credentials not configured. Set speechKey and speechRegion in Settings.`);
        }
      }

      if (msg.message === 'KeepAlive') {
        ws.send(JSON.stringify({ message: 'KeepAlive', sessionID: msg.sessionID }));
      }

      if (msg.message === 'RecognitionResult' || msg.type === 'activities') {
        const text = msg.text || msg.alternatives?.[0]?.text || '';
        const sessionId = msg.sessionID || 'unknown';
        if (text) {
          emitAi(`User said: "${text}"`);
          console.log(`[bot-ws] User speech: "${text}"`);
          fetch(`http://localhost:${PORT}/api/audiocodes/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'activities',
              conversationId: sessionId,
              caller: msg.caller || 'unknown',
              activities: [{ type: 'message', text }],
            }),
          })
            .then((res) => res.json() as Promise<{ activities?: { type?: string; text?: string; name?: string; parameters?: Record<string, unknown> }[] }>)
            .then((response) => {
              if (response.activities) {
                for (const activity of response.activities) {
                  if (activity.type === 'message' && activity.text) {
                    emitInfo(`Bot response: "${activity.text}"`);
                  }
                  if (activity.type === 'event' && activity.name === 'transfer') {
                    emitTransfer(`Transfer to: ${activity.parameters?.target || ''}`);
                  }
                }
              }
            })
            .catch((err) => console.error('[bot-ws] Webhook processing error:', err));
        }
      }
    } catch (err) {
      console.error('[bot-ws] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[bot-ws] VoiceAI WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[bot-ws] WebSocket error:', err);
  });
});

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  if (url.pathname === botWsPath) {
    botWsServer.handleUpgrade(request, socket, head, (ws) => {
      botWsServer.emit('connection', ws, request);
    });
  }
});

console.log(`[webhook] Bot WebSocket endpoint: ws://localhost:${PORT}${botWsPath}`);

// ── SIP Media Endpoint ──────────────────────────────────────────────
const sipPort = parseInt(process.env.SIP_PORT || '5060', 10);
const sipEndpoint = new SipMediaEndpoint(sipPort);
try {
  sipEndpoint.listen();
  console.log(`[webhook] SIP Media Endpoint listening on UDP port ${sipPort}`);
} catch (err: any) {
  console.error(`[sip] Failed to start: ${err.message}. HTTP will still work.`);
  emitError(`[sip] SIP endpoint not available: ${err.message}`);
}

sipEndpoint.onAudioData = (sessionId, audioBuffer) => {
  const cfg = getConfig();
  if (cfg.speechKey && cfg.speechRegion) {
    let processor = asrProcessors.get(sessionId);
    if (!processor) {
      processor = new VoiceAiAsrProcessor(
        sessionId,
        cfg.speechKey,
        cfg.speechRegion,
        (text) => {
          emitAi(`User said: "${text}"`);

          const spoken = text.trim();
          if (shouldForceHangup(spoken)) {
            emitInfo(`Immediate force hangup detected from ASR: "${spoken}"`);
            void sipEndpoint.playText(sessionId, 'ขอบคุณที่ติดต่อค่ะ สวัสดีค่ะ')
              .catch((err) => {
                console.error('[sip] Failed to play hangup prompt:', err);
              })
              .finally(() => {
                sipEndpoint.sendBye(sessionId, 'Caller requested hangup');
              });
            return;
          }

          fetch(`http://localhost:${PORT}/api/audiocodes/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'activities',
              conversationId: sessionId,
              caller: 'sip-caller',
              activities: [{ type: 'message', text }],
            }),
          })
            .then((res) => res.json())
            .then((response: any) => {
              if (!response.activities) return;

              void (async () => {
                for (const activity of response.activities) {
                  if (activity.type === 'message' && activity.text) {
                    emitInfo(`Bot response: "${activity.text}"`);
                    await sipEndpoint.playText(sessionId, activity.text);
                  }
                  if (activity.type === 'event' && activity.name === 'transfer') {
                    const target = activity.parameters?.target as string || '';
                    emitTransfer(`Transfer to: ${target}`);
                    sipEndpoint.sendTransfer(sessionId, target);
                  }
                  if (activity.type === 'event' && activity.name === 'hangup') {
                    emitInfo(`Sending SIP BYE for session ${sessionId} (forced hangup intent)`);
                    sipEndpoint.sendBye(sessionId);
                  }
                }
              })().catch((err) => console.error('[sip] Failed to play bot response:', err));
            })
            .catch((err) => console.error('[sip] Webhook error:', err));
        },
        (err) => emitError(`ASR error: ${err.message}`),
      );
      asrProcessors.set(sessionId, processor);
    }
    const buf = Buffer.from(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
    processor.feedAudio(buf);
  }
};

sipEndpoint.onCallEnded = (sessionId) => {
  emitCallEvent('call-ended', sessionId, 'sip-caller');
  logCallEnd(sessionId, 'completed');
  const processor = asrProcessors.get(sessionId);
  if (processor) { processor.stop(); asrProcessors.delete(sessionId); }
};

console.log(`[webhook] SIP Media Endpoint configured for UDP port ${sipPort}`);

// Middleware to parse JSON bodies (limit size to prevent JSON injection)
app.use(express.json({ limit: '16kb' }));

// ── Global rate limiters ────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests. Rate limit exceeded.' },
});

const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Zod validation schemas ──────────────────────────────────────────
const loginSchema = z.object({
  username: z.string().min(1).max(64).trim(),
  password: z.string().min(1).max(128),
});

const webhookPayloadSchema = z.object({
  event: z.string().max(64).optional(),
  type: z.string().max(64).optional(),
  conversationId: z.string().max(128).optional(),
  caller: z.string().max(64).optional(),
  text: z.string().max(500).optional(),
  activities: z.array(z.any()).max(20).optional(),
  activity: z.any().optional(),
}).strict();

// ── Apply rate limiters to routes ───────────────────────────────────
app.use('/api/admin/auth/login', loginLimiter);
app.use('/api/audiocodes/webhook', webhookLimiter);
app.use('/api/admin', adminApiLimiter);

// ── Public auth route (no token required) ───────────────────────────
app.use('/api/admin/auth', authRouter);
app.use('/api/admin/auth', mfaRouter);

// ── Admin API routers (JWT protected via internal middleware) ───────
app.use('/api/admin', adminRouter);
app.use('/api/admin', unhandledRouter);
app.use('/api/admin', departmentRouter);
app.use('/api/admin', callStatsRouter);
app.use('/api/admin/config', testRouteRouter);
app.use('/api/admin', usersRouter);

/**
 * AudioCodes VoiceAI Connect Webhook payload.
 * Can be a top-level event or a message with activities.
 */
interface AudioCodesWebhookPayload {
  event?: string;
  type?: string;
  conversationId?: string;
  caller?: string;
  activities?: BotActivity[];
  activity?: BotActivity;
  text?: string;
}

/**
 * POST /api/audiocodes/webhook
 *
 * Handles incoming JSON payloads from AudioCodes VoiceAI Connect.
 * All tunable values (prompts, API keys, model IDs, etc.) are read from
 * the live in-memory config, so changes made via the admin dashboard take
 * effect immediately without a server restart.
 *
 * Flow:
 *   1. sessionStart        → reply with welcome TTS prompt
 *   2. message / activities → extract Thai name → find Teams user → transfer or error
 *   3. hangup              → log the event
 *   4. default             → acknowledge receipt
 */
app.post('/api/audiocodes/webhook', async (req: Request, res: Response) => {
  try {
    const cfg = getConfig();

    // ── Input validation ──────────────────────────────────────────
    const parsed = webhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[webhook] Invalid payload:', parsed.error.flatten());
      return res.status(200).json({ received: true });
    }

    const payload = parsed.data;
    console.log('[webhook] Received payload:', JSON.stringify(payload));

    const eventType = payload.event || payload.type;

    switch (eventType) {
      // ── Incoming call ────────────────────────────────────────────────
      case 'sessionStart': {
        const caller = payload.caller || 'unknown';
        const convId = payload.conversationId || caller;
        emitCallEvent('call-started', convId, caller);
        logCallStart(convId, caller, '');
        emitInfo(`Incoming call accepted from ${caller}`);
        // Reset retry counter for this conversation
        resetRetry(convId);
        console.log('[webhook] Session started. Sending welcome prompt.');
        const welcomeActivity: BotActivity = {
          type: BotActivityType.message,
          text: cleanTextForThaiTts(cfg.welcomeMessage),
        };
        return res.status(200).json({ activities: [welcomeActivity] });
      }

      // ── User speech transcribed ──────────────────────────────────────
      case 'message':
      case 'activities': {
        const activities = payload.activities ?? (payload.activity ? [payload.activity] : []);

        for (const activity of activities) {
          // Hangup
          if (
            activity.type === BotActivityType.event
            && activity.name === BotActivityEventName.hangup
          ) {
            const endedConvId = payload.conversationId || payload.caller || 'unknown';
            emitCallEvent('call-ended', endedConvId, payload.caller || 'unknown');
            logCallEnd(endedConvId, 'completed');
            emitInfo('Call ended by caller or hung up');
            console.log('[webhook] Conversation ended (hangup).');
            return res.status(200).json({ received: true });
          }

          // Transfer failure (busy, rejected, timeout, offline)
          if (
            activity.type === BotActivityType.event
            && activity.name === BotActivityEventName.transfer
            && activity.parameters
          ) {
            const params = activity.parameters as Record<string, unknown>;
            const status = String(params.status || params.result || '').toLowerCase();
            const isFailure = !status || ['failed', 'busy', 'rejected', 'timeout', 'unavailable', 'error', 'offline'].includes(status);

            if (isFailure) {
              const reason = status || 'unknown';
              emitTransfer(`Transfer reported as failed (${reason}). Initiating fallback...`);
              console.log(`[webhook] Transfer failure detected: ${reason}`);
              const fallbackResponse = generateTransferFallbackResponse(reason);
              return res.status(200).json(fallbackResponse);
            }
          }

          // User speech (or silence)
          if (activity.type === BotActivityType.message) {
            const userSpeech = String(activity.text || '').trim();
            const convId = payload.conversationId || payload.caller || 'unknown';

            // ── Silence detection: if ASR returns empty, treat as failed routing ──
            if (!userSpeech) {
              emitInfo(`Silence detected for conv ${convId} — treating as failed routing attempt`);
              const attempts = incrementRetry(convId);
              emitInfo(`Silence routing attempt ${attempts}/${cfg.maxRetries} for conv ${convId}`);
              if (attempts >= cfg.maxRetries) {
                emitTransfer(`Max retries reached (silence). Routing to fallback: ${cfg.fallbackDestination}`);
                const fallbackSip = cfg.fallbackDestination?.replace(/^sip:/iu, '') || 'operator-queue@company.com';
                const fallbackPrompt = cfg.fallbackTransferPrompt || 'ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ';
                const fallbackTransfer = generateTransferResponse(fallbackSip, fallbackPrompt);
                return res.status(200).json(fallbackTransfer);
              }
              const retryActivity: BotActivity = {
                type: BotActivityType.message,
                text: cleanTextForThaiTts('ไม่ยินเสียงของท่าน กรุณาพูดใหม่อีกครั้ง'),
              };
              return res.status(200).json({ activities: [retryActivity] });
            }

            const spokenText = userSpeech;
            console.log('[webhook] User said:', userSpeech);

            if (shouldForceHangup(spokenText)) {
              emitInfo(`Forced hangup intent detected from speech: "${spokenText}"`);
              const endCallActivities: BotActivity[] = [
                { type: BotActivityType.message, text: cleanTextForThaiTts('ขอบคุณที่ติดต่อค่ะ สวัสดีค่ะ') },
                { type: BotActivityType.event, name: BotActivityEventName.hangup },
              ];
              return res.status(200).json({ activities: endCallActivities });
            }

            // Step 1: Extract intent via OpenRouter AI (returns structured JSON)
            emitAi(`Processing user speech via OpenRouter...`);
            const aiResult = await extractThaiName(userSpeech);

            // Fallback parser for production: if AI returns unknown/error,
            // infer simple intents directly from the spoken text.
            const routingResult = inferRoutingFromSpeech(aiResult, spokenText);
            if (routingResult && aiResult && routingResult !== aiResult && isFailedRouting(aiResult)) {
              emitAi(`Fallback parsed: target_type="${routingResult.target_type}", value="${routingResult.extracted_value}"`);
            }

            // Log unhandled intent when AI failed to understand (even if fallback parser converted it)
            if (aiResult && isFailedRouting(aiResult)) {
              logUnhandledIntent(userSpeech, aiResult).catch((err) =>
                console.error('[webhook] Failed to log unhandled intent:', err)
              );
            }

            // ── Check retry counter for failed routing ──────────────
            if (isFailedRouting(routingResult)) {
              const attempts = incrementRetry(convId);
              emitInfo(`Failed routing attempt ${attempts}/${cfg.maxRetries} for conv ${convId}`);

              if (attempts >= cfg.maxRetries) {
                // Max retries reached — transfer to fallback destination
                emitTransfer(`Max retries reached. Routing to fallback: ${cfg.fallbackDestination}`);
                const fallbackSip = cfg.fallbackDestination?.replace(/^sip:/iu, '') || 'operator-queue@company.com';
                const fallbackPrompt = cfg.fallbackTransferPrompt || 'ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ';
                const fallbackTransfer = generateTransferResponse(fallbackSip, fallbackPrompt);
                return res.status(200).json(fallbackTransfer);
              }
            }

            if (!routingResult) {
              emitError('OpenRouter API call failed');
              console.log('[webhook] OpenRouter API call failed.');
              const retryActivity: BotActivity = {
                type: BotActivityType.message,
                text: cleanTextForThaiTts(cfg.fallbackMessage),
              };
              return res.status(200).json({ activities: [retryActivity] });
            }

            emitAi(`AI parsed: target_type="${routingResult.target_type}", value="${routingResult.extracted_value}"`);
            console.log('[webhook] AI result:', routingResult);

            try {
              switch (routingResult.target_type) {
                // ── Extension (e.g. "ต่อ 1234") ───────────────────────
                case 'extension': {
                  const extValue = routingResult.extracted_value?.trim() || '';

                  // For 4-digit extensions, resolve via Entra phone numbers first.
                  if (/^\d{4}$/u.test(extValue)) {
                    const mappedPhone = resolveFallbackMappedPhone({ extension: extValue });
                    if (mappedPhone) {
                      emitTransfer(`Routing extension ${extValue} via fallback mapping to phone: ${mappedPhone}`);
                      resetRetry(convId);
                      logCallRouting(convId, 'extension-fallback', mappedPhone);
                      const extResponse = generateTransferResponse(mappedPhone, 'กำลังโอนสายให้ค่ะ');
                      return res.status(200).json(extResponse);
                    }
                    if (!(cfg.fallbackMappings && cfg.fallbackMappings.length > 0)) {
                      emitInfo('No fallbackMappings configured for extension lookup. Configure fallbackMappings in config.json for production fallback routing.');
                    }

                    emitEntraId(`Looking up extension '${extValue}' by phone suffix in Entra ID...`);
                    const extLookup = await findTeamsUserByThaiName(extValue);

                    if (extLookup.isDuplicate && extLookup.matches.length > 1) {
                      const choices = formatDuplicateUserChoicesForThaiTts(extLookup.matches);
                      const duplicatePrompt = `พบเบอร์ต่อ ${extValue} ซ้ำกัน ${extLookup.matches.length} ราย คือ ${choices} กรุณาแจ้งหมายเลขเบอร์ภายใน 4 หลัก ของคนที่ท่านต้องการติดต่อค่ะ`;
                      const duplicateActivity: BotActivity = {
                        type: BotActivityType.message,
                        text: cleanTextForThaiTts(duplicatePrompt),
                      };
                      return res.status(200).json({ activities: [duplicateActivity] });
                    }

                    if (extLookup.transferTarget) {
                      emitTransfer(`Routing extension ${extValue} to phone: ${extLookup.transferTarget}`);
                      resetRetry(convId);
                      logCallRouting(convId, 'extension-entra', extLookup.transferTarget);
                      const extResponse = generateTransferResponse(extLookup.transferTarget, `กำลังโอนสายให้ค่ะ`);
                      return res.status(200).json(extResponse);
                    }

                    const extNotFoundActivity: BotActivity = {
                      type: BotActivityType.message,
                      text: cleanTextForThaiTts(`ไม่พบเบอร์ต่อ ${extValue} ในรายชื่อพนักงานค่ะ กรุณาแจ้งชื่อผู้ติดต่ออีกครั้งค่ะ`),
                    };
                    return res.status(200).json({ activities: [extNotFoundActivity] });
                  }

                  const isE164 = extValue.startsWith('+');
                  const sipDomain = isE164
                    ? 'sip.pstnhub.microsoft.com'
                    : cfg.sipDomain.replace(/^sip:/iu, '');
                  const target = `${extValue}@${sipDomain}`;
                  emitTransfer(`Routing to extension: ${extValue} → sip:${target}`);
                  resetRetry(convId);
                  logCallRouting(convId, 'extension', target);
                  const extResponse = generateTransferResponse(target, 'กำลังโอนสายให้ค่ะ');
                  return res.status(200).json(extResponse);
                }

                // ── Person name (e.g. "คุณสมชาย") ─────────────────────
                case 'user': {
                  // Step 0: Check if the extracted value matches a department alias
                  const deptSip = getDepartmentSipUri(routingResult.extracted_value);
                  if (deptSip) {
                    emitTransfer(`Routing '${routingResult.extracted_value}' as department alias to: ${deptSip}`);
                    const deptTarget = deptSip.replace(/^sip:/iu, '');
                    resetRetry(convId);
                    logCallRouting(convId, 'department-alias', deptTarget);
                    const deptResponse = generateTransferResponse(deptTarget, `กำลังโอนสายไปยังแผนกที่เกี่ยวข้องค่ะ`);
                    return res.status(200).json(deptResponse);
                  }
                  // Step 1: Check fallback mappings FIRST (before Entra lookup)
                  const fbCandidates = findFallbackMappingCandidates({
                    name: routingResult.extracted_value,
                  });
                  if (fbCandidates.length > 1) {
                    // ── Duplicate names in fallback mappings! Ask caller ──
                    const names = fbCandidates.map((c) => `${c.name} (${c.phone})`).join(' , ');
                    emitInfo(`Found ${fbCandidates.length} fallback mappings for "${routingResult.extracted_value}": ${names}`);
                    const duplicatePrompt = `พบชื่อซ้ำ ${fbCandidates.length} ราย คือ ${names} กรุณาแจ้งหมายเลขเบอร์ภายใน 4 หลัก ของคนที่ท่านต้องการติดต่อค่ะ`;
                    const duplicateActivity: BotActivity = {
                      type: BotActivityType.message,
                      text: cleanTextForThaiTts(duplicatePrompt),
                    };
                    return res.status(200).json({ activities: [duplicateActivity] });
                  }
                  if (fbCandidates.length === 1) {
                    emitTransfer(`Routing user '${routingResult.extracted_value}' via fallback mapping to phone: ${fbCandidates[0].phone}`);
                    resetRetry(convId);
                    logCallRouting(convId, 'fallback', fbCandidates[0].phone);
                    const fbResponse = generateTransferResponse(fbCandidates[0].phone, 'กำลังโอนสายให้ค่ะ');
                    return res.status(200).json(fbResponse);
                  }

                  // Step 2: Fall back to Entra ID lookup
                  emitEntraId(`Looking up user '${routingResult.extracted_value}' in Entra ID...`);
                  const lookupResult = await findTeamsUserByThaiName(routingResult.extracted_value);

                  if (lookupResult.isDuplicate && lookupResult.matches.length > 1) {
                    // ── Duplicate names found! Inform the caller ──────────
                    const names = formatDuplicateUserChoicesForThaiTts(lookupResult.matches);
                    emitEntraId(`Found ${lookupResult.matches.length} users matching "${routingResult.extracted_value}": ${names}`);
                    const duplicatePrompt = `พบชื่อซ้ำ ${lookupResult.matches.length} ราย คือ ${names} กรุณาแจ้งหมายเลขเบอร์ภายใน 4 หลัก ของคนที่ท่านต้องการติดต่อค่ะ`;
                    const duplicateActivity: BotActivity = {
                      type: BotActivityType.message,
                      text: cleanTextForThaiTts(duplicatePrompt),
                    };
                    return res.status(200).json({ activities: [duplicateActivity] });
                  }

                  if (lookupResult.upn) {
                    emitEntraId(`Found user: ${lookupResult.upn} phone=${lookupResult.phoneNumber ?? 'n/a'}`);
                  }

                  if (lookupResult.transferTarget) {
                    emitTransfer(`Routing to user phone: ${lookupResult.transferTarget}`);
                    resetRetry(convId);
                    logCallRouting(convId, 'user', lookupResult.transferTarget || '');
                    const response = generateTransferResponse(lookupResult.transferTarget, 'กำลังโอนสายให้ค่ะ');
                    return res.status(200).json(response);
                  }

                  const mappedPhone = resolveFallbackMappedPhone({
                    name: routingResult.extracted_value,
                    upn: lookupResult.upn || undefined,
                  });
                  if (mappedPhone) {
                    emitTransfer(`Routing user '${routingResult.extracted_value}' via fallback mapping to phone: ${mappedPhone}`);
                    resetRetry(convId);
                    logCallRouting(convId, 'entra-fallback', mappedPhone);
                    const mappedResponse = generateTransferResponse(mappedPhone, 'กำลังโอนสายให้ค่ะ');
                    return res.status(200).json(mappedResponse);
                  }
                  if (!(cfg.fallbackMappings && cfg.fallbackMappings.length > 0)) {
                    emitInfo('No fallbackMappings configured for user lookup. Configure fallbackMappings in config.json for production fallback routing.');
                  }

                  if (lookupResult.matches.length === 1 && !lookupResult.transferTarget) {
                    emitEntraId(`User '${routingResult.extracted_value}' found but has no phone number`);
                    const attempts = incrementRetry(convId);
                    emitInfo(`Failed routing attempt ${attempts}/${cfg.maxRetries} for conv ${convId} (no phone)`);
                                        if (attempts >= cfg.maxRetries) {
                      emitTransfer(`Max retries reached. Routing to fallback: ${cfg.fallbackDestination}`);
                      const fallbackSip = cfg.fallbackDestination?.replace(/^sip:/iu, '') || 'operator-queue@company.com';
                      const fallbackPrompt = cfg.fallbackTransferPrompt || 'ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ';
                      const fallbackTransfer = generateTransferResponse(fallbackSip, fallbackPrompt);
                      return res.status(200).json(fallbackTransfer);
                    }
                    const noPhoneActivity: BotActivity = {
                      type: BotActivityType.message,
                      text: cleanTextForThaiTts('พบข้อมูลผู้ใช้แล้ว แต่ยังไม่มีเบอร์สำหรับโอนสายค่ะ'),
                    };
                    return res.status(200).json({ activities: [noPhoneActivity] });
                  }

                  emitEntraId(`User '${routingResult.extracted_value}' not found`);
                  const attempts = incrementRetry(convId);
                  emitInfo(`Failed routing attempt ${attempts}/${cfg.maxRetries} for conv ${convId} (user not found)`);
                  if (attempts >= cfg.maxRetries) {
                    emitTransfer(`Max retries reached. Routing to fallback: ${cfg.fallbackDestination}`);
                    const fallbackSip = cfg.fallbackDestination?.replace(/^sip:/iu, '') || 'operator-queue@company.com';
                    const fallbackPrompt = cfg.fallbackTransferPrompt || 'ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ';
                    const fallbackTransfer = generateTransferResponse(fallbackSip, fallbackPrompt);
                    return res.status(200).json(fallbackTransfer);
                  }
                  const notFoundActivity: BotActivity = {
                    type: BotActivityType.message,
                    text: cleanTextForThaiTts('ไม่พบข้อมูลที่ระบุค่ะ กรุณาแจ้งชื่อหรือเบอร์ต่ออีกครั้งค่ะ'),
                  };
                  return res.status(200).json({ activities: [notFoundActivity] });
                }

                // ── Department (e.g. "ฝ่ายบัญชี") ─────────────────────
                case 'department': {
                  emitInfo(`Looking up department SIP URI for '${routingResult.extracted_value}'...`);
                  const deptSip = getDepartmentSipUri(routingResult.extracted_value);

                  if (deptSip) {
                    const deptTarget = deptSip.replace(/^sip:/iu, '');
                    emitTransfer(`Routing to department: sip:${deptTarget}`);
                    resetRetry(convId);
                    logCallRouting(convId, 'department', deptTarget);
                    const deptResponse = generateTransferResponse(deptTarget, `กำลังโอนสายไปยัง${routingResult.extracted_value}ค่ะ`);
                    return res.status(200).json(deptResponse);
                  }

                  emitInfo(`Department '${routingResult.extracted_value}' not found`);
                  const deptNotFound: BotActivity = {
                    type: BotActivityType.message,
                    text: cleanTextForThaiTts('ไม่พบแผนกที่ต้องการติดต่อค่ะ'),
                  };
                  return res.status(200).json({ activities: [deptNotFound] });
                }

                // ── Unknown ───────────────────────────────────────────
                case 'unknown':
                default: {
                  emitInfo('AI could not determine the target — asking user to repeat');
                  const unknownActivity: BotActivity = {
                    type: BotActivityType.message,
                    text: cleanTextForThaiTts('ขออภัยค่ะ กรุณาแจ้งชื่อบุคคล แผนก หรือเบอร์ต่อที่ต้องการติดต่ออีกครั้งค่ะ'),
                  };
                  return res.status(200).json({ activities: [unknownActivity] });
                }
              }
            } catch (routeErr) {
              const msg = routeErr instanceof Error ? routeErr.message : String(routeErr);
              emitError(`Routing error: ${msg}`);
              console.error('[webhook] Routing error:', routeErr);
              const errorActivity: BotActivity = {
                type: BotActivityType.message,
                text: cleanTextForThaiTts(cfg.fallbackMessage),
              };
              return res.status(200).json({ activities: [errorActivity] });
            }
          }
        }

        // No recognizable message activity
        return res.status(200).json({ received: true });
      }

      default: {
        console.log('[webhook] Unhandled event type:', eventType);
        return res.status(200).json({ received: true });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emitError(`Webhook error: ${msg}`);
    console.error('[webhook] Error handling request:', error);
    return res.status(200).json({ received: true });
  }
});

// ── SPA fallback: serve index.html for all non-API routes ───────────
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(dashboardDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

// Start the HTTP server (handles both Express + WebSocket)
httpServer.listen(PORT, () => {
  console.log(`[webhook] AudioCodes Webhook server listening on port ${PORT}`);
  console.log(`[webhook] POST endpoint: http://localhost:${PORT}/api/audiocodes/webhook`);
  if (fs.existsSync(dashboardDist)) {
    console.log(`[webhook] Admin Dashboard: http://localhost:${PORT}/`);
  }
});

export default app;