import { Router, type Request, type Response } from 'express';
import { getConfig, updateConfig } from './config-manager.js';
import { maskSecrets } from './config-types.js';
import { testOpenRouterConnection, testAzureAdConnection } from './test-connections.js';
import { authenticateAdmin, authorizeRoles } from './auth-jwt.js';

const router = Router();

// All routes require JWT authentication + SUPER_ADMIN role
router.use(authenticateAdmin);
router.use(authorizeRoles('SUPER_ADMIN'));

/**
 * GET /api/admin/config
 *
 * Returns the current configuration with secrets masked.
 */
router.get('/config', (_req: Request, res: Response) => {
  const config = getConfig();
  res.json(maskSecrets(config));
});

/**
 * POST /api/admin/config
 *
 * Accepts a partial configuration payload, validates, updates the in-memory
 * config, persists to disk, verifies the write, and broadcasts a hot-reload
 * log event. Returns the updated config with secrets masked plus a success message.
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const patch = req.body;

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }

    // Log incoming payload keys for debugging
    console.log('[admin] Config update payload keys:', Object.keys(patch));

    const result = updateConfig(patch);
    console.log('[admin] Configuration updated and verified.');

    // Return config (masked) plus the verification success message
    res.json({
      ...maskSecrets(result),
      verified: true,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[admin] Config update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/test-connection
 *
 * Tests connectivity to an external service using the current live config.
 * Expects: { service: 'openrouter' | 'azure' }
 */
router.post('/test-connection', async (req: Request, res: Response) => {
  const { service } = req.body as { service?: string };

  if (!service || !['openrouter', 'azure'].includes(service)) {
    return res.status(400).json({ error: 'Provide a valid service: "openrouter" or "azure".' });
  }

  const cfg = getConfig();

  let result: { success: boolean; debugLogs: string[]; errorMessage: string | null };

  if (service === 'openrouter') {
    console.log('[admin] Testing OpenRouter connection…');
    result = await testOpenRouterConnection(cfg.openRouterApiKey, cfg.aiModelId);
  } else {
    console.log('[admin] Testing Azure AD connection…');
    result = await testAzureAdConnection(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  }

  res.json({
    success: result.success,
    service,
    message: result.success
      ? (service === 'openrouter'
          ? 'OpenRouter connection verified successfully.'
          : 'Azure AD connection verified successfully.')
      : undefined,
    debugLogs: result.debugLogs,
    errorMessage: result.errorMessage,
  });
});

export default router;