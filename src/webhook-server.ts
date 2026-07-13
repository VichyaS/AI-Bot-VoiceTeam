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
import { findTeamsUserByThaiName } from './graph-user.js';
import { getDepartmentSipUri } from './department-lookup.js';
import { generateTransferResponse } from './transfer.js';
import { generateTransferFallbackResponse } from './transfer-fallback.js';
import { getConfig } from './config-manager.js';
import { BotApiWebSocket } from './websocket/bot-api.js';
import type { BotConversationWebSocket } from './websocket/bot-conversation.js';
import adminRouter from './admin-router.js';
import authRouter from './auth-router.js';
import unhandledRouter from './unhandled-router.js';
import departmentRouter from './department-router.js';
import testRouteRouter from './test-route-router.js';
import usersRouter from './users-router.js';
import mfaRouter from './mfa-router.js';
import { createLogWebSocketServer } from './ws-server.js';
import { emitInfo, emitAi, emitEntraId, emitTransfer, emitError, emitCallEvent } from './system-logger.js';
import { logUnhandledIntent } from './unhandled-intents.js';
import { cleanTextForThaiTts } from './tts-cleaner.js';
import { getRetryCount, incrementRetry, resetRetry } from './retry-counter.js';

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
const PORT = process.env.PORT || 8081;

// ── Serve built admin dashboard (production) ────────────────────────
const dashboardDist = path.resolve(__dirname, '..', 'admin-dashboard', 'dist');
if (fs.existsSync(dashboardDist)) {
  console.log(`[webhook] Serving admin dashboard from ${dashboardDist}`);
  app.use(express.static(dashboardDist));
}

// ── Security middleware ─────────────────────────────────────────────
app.use(helmet({
  hidePoweredBy: true,   // Remove X-Powered-By header
  contentSecurityPolicy: false, // Allow inline styles for Tailwind
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

// Create a single HTTP server manually so we can attach WebSocket
const httpServer = createServer(app);

// Attach WebSocket server (noServer mode using HTTP upgrade)
createLogWebSocketServer(httpServer);

// ── AudioCodes Bot API WebSocket Server ────────────────────────────
// This is the WebSocket endpoint that SBC VoiceAI Connect connects to
// using the URL configured in Voice.AI Connectors.
const botWsPath = '/api/audiocodes/bot-ws';
const botApi = new BotApiWebSocket();
botApi.listen({
  server: httpServer,
  path: botWsPath,
});
console.log(`[webhook] Bot WebSocket endpoint: ws://localhost:${PORT}${botWsPath}`);

// Handle incoming conversations from VoiceAI Connect
botApi.on('conversation', (conversation: BotConversationWebSocket, info: { request: import('http').IncomingMessage; initiateMessage: import('./websocket/types.js').ProtocolMessage }) => {
  const convId = info.initiateMessage.conversationId || 'unknown';
  console.log(`[bot-ws] New conversation started: ${convId}`);
  emitCallEvent('call-started', convId, info.initiateMessage.caller || 'unknown');

  // Handle activities from VoiceAI (transcribed speech, events)
  conversation.on('activity', (activity: import('./websocket/types.js').BotActivity) => {
    console.log(`[bot-ws] Activity received:`, activity);
    // Process the activity similar to webhook handler
    // For now, log it — the webhook handler is the primary processing path
  });

  conversation.on('end', () => {
    console.log(`[bot-ws] Conversation ended: ${convId}`);
    emitCallEvent('call-ended', convId, 'unknown');
  });
});

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

          // User speech
          // Helper to check if a result is a "failed attempt" (unknown or error)
          function isFailedRouting(result: { target_type: string; extracted_value: string } | null): boolean {
            return !result || result.target_type === 'unknown' || result.target_type === 'error';
          }

          if (activity.type === BotActivityType.message && activity.text) {
            const userSpeech = String(activity.text);
            const convId = payload.conversationId || payload.caller || 'unknown';
            console.log('[webhook] User said:', userSpeech);

            // Step 1: Extract intent via OpenRouter AI (returns structured JSON)
            emitAi(`Processing user speech via OpenRouter...`);
            const aiResult = await extractThaiName(userSpeech);

            // ── Check retry counter for failed routing ──────────────
            if (isFailedRouting(aiResult)) {
              const attempts = incrementRetry(convId);
              emitInfo(`Failed routing attempt ${attempts}/${cfg.maxRetries} for conv ${convId}`);

              if (attempts >= cfg.maxRetries) {
                // Max retries reached — transfer to fallback destination
                emitTransfer(`Max retries reached. Routing to fallback: ${cfg.fallbackDestination}`);
                const fallbackSip = cfg.fallbackDestination?.replace(/^sip:/iu, '') || 'operator-queue@company.com';
                const fallbackTransfer = generateTransferResponse(fallbackSip, 'ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ');
                return res.status(200).json(fallbackTransfer);
              }
            }

            if (!aiResult) {
              emitError('OpenRouter API call failed');
              console.log('[webhook] OpenRouter API call failed.');
              const retryActivity: BotActivity = {
                type: BotActivityType.message,
                text: cleanTextForThaiTts(cfg.fallbackMessage),
              };
              return res.status(200).json({ activities: [retryActivity] });
            }

            emitAi(`AI parsed: target_type="${aiResult.target_type}", value="${aiResult.extracted_value}"`);
            console.log('[webhook] AI result:', aiResult);

            try {
              switch (aiResult.target_type) {
                // ── Extension (e.g. "ต่อ 1234") ───────────────────────
                case 'extension': {
                  const sipDomain = cfg.sipDomain.replace(/^sip:/iu, '');
                  const target = `${aiResult.extracted_value}@${sipDomain}`;
                  emitTransfer(`Routing to extension: ${aiResult.extracted_value} → sip:${target}`);
                  resetRetry(convId);

                  const extResponse = generateTransferResponse(target, `กำลังโอนสายไปยังเบอร์${aiResult.extracted_value}ค่ะ`);
                  return res.status(200).json(extResponse);
                }

                // ── Person name (e.g. "คุณสมชาย") ─────────────────────
                case 'user': {
                  emitEntraId(`Looking up user '${aiResult.extracted_value}' in Entra ID...`);
                  const lookupResult = await findTeamsUserByThaiName(aiResult.extracted_value);

                  if (lookupResult.isDuplicate && lookupResult.matches.length > 1) {
                    // ── Duplicate names found! Inform the caller ──────────
                    const names = lookupResult.matches.map((m) => m.displayName).join(', ');
                    emitEntraId(`Found ${lookupResult.matches.length} users matching "${aiResult.extracted_value}": ${names}`);
                    const duplicatePrompt = `พบข้อมูลผู้ใช้ชื่อเดียวกัน ${lookupResult.matches.length} คน คือ ${names} กรุณาระบุชื่อหรือแผนกให้ชัดเจนยิ่งขึ้นค่ะ`;
                    const duplicateActivity: BotActivity = {
                      type: BotActivityType.message,
                      text: cleanTextForThaiTts(duplicatePrompt),
                    };
                    return res.status(200).json({ activities: [duplicateActivity] });
                  }

                  if (lookupResult.upn) {
                    emitEntraId(`Found UPN: ${lookupResult.upn}`);
                    emitTransfer(`Routing to user: ${lookupResult.upn}`);
                    resetRetry(convId);
                    const response = generateTransferResponse(lookupResult.upn, `กำลังโอนสายไปยังคุณ${aiResult.extracted_value}ค่ะ`);
                    return res.status(200).json(response);
                  }

                  emitEntraId(`User '${aiResult.extracted_value}' not found`);
                  const notFoundActivity: BotActivity = {
                    type: BotActivityType.message,
                    text: cleanTextForThaiTts('ไม่พบชื่อพนักงานที่ระบุค่ะ'),
                  };
                  return res.status(200).json({ activities: [notFoundActivity] });
                }

                // ── Department (e.g. "ฝ่ายบัญชี") ─────────────────────
                case 'department': {
                  emitInfo(`Looking up department SIP URI for '${aiResult.extracted_value}'...`);
                  const deptSip = getDepartmentSipUri(aiResult.extracted_value);

                  if (deptSip) {
                    const deptTarget = deptSip.replace(/^sip:/iu, '');
                    emitTransfer(`Routing to department: sip:${deptTarget}`);
                    resetRetry(convId);
                    const deptResponse = generateTransferResponse(deptTarget, `กำลังโอนสายไปยัง${aiResult.extracted_value}ค่ะ`);
                    return res.status(200).json(deptResponse);
                  }

                  emitInfo(`Department '${aiResult.extracted_value}' not found`);
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
                  // Log the unhandled intent for admin review
                  logUnhandledIntent(userSpeech, aiResult).catch((err) =>
                    console.error('[webhook] Failed to log unhandled intent:', err)
                  );
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