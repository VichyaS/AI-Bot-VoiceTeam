import { Router, type Request, type Response } from 'express';
import { authenticateAdmin } from './auth-jwt.js';
import { getConfig } from './config-manager.js';
import { testOpenRouterConnection, testAzureAdConnection } from './test-connections.js';

const router = Router();
router.use(authenticateAdmin);

/**
 * POST /api/admin/config/test-route
 *
 * Force-sync test: verifies OpenRouter API and Azure AD connectivity
 * and returns the results with latency measurements.
 */
router.post('/test-route', async (_req: Request, res: Response) => {
  const cfg = getConfig();
  const start = Date.now();

  const orResult = await testOpenRouterConnection(cfg.openRouterApiKey, cfg.aiModelId);
  const azureResult = await testAzureAdConnection(cfg.tenantId, cfg.clientId, cfg.clientSecret);

  const latencyMs = Date.now() - start;

  res.json({
    success: orResult.success && azureResult.success,
    latencyMs,
    openrouter: orResult,
    azure: azureResult,
    message: orResult.success && azureResult.success
      ? 'All services online.'
      : 'One or more services failed.',
  });
});

export default router;