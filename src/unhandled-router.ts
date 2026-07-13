import { Router, type Request, type Response } from 'express';
import { authenticateAdmin, authorizeRoles } from './auth-jwt.js';
import { getUnhandledLogs, resolveUnhandledLog } from './unhandled-intents.js';

const router = Router();

// All routes require JWT + both roles can access
router.use(authenticateAdmin);
router.use(authorizeRoles('SUPER_ADMIN', 'IVR_MANAGER'));

/**
 * GET /api/admin/unhandled-logs
 *
 * Returns all unhandled-intent log entries, newest first.
 */
router.get('/unhandled-logs', (_req: Request, res: Response) => {
  const logs = getUnhandledLogs();
  res.json({ count: logs.length, logs });
});

/**
 * POST /api/admin/unhandled-logs/resolve
 *
 * Marks a specific unhandled-intent log entry as "resolved".
 *
 * Body: { id: string, note?: string }
 */
router.post('/unhandled-logs/resolve', (req: Request, res: Response) => {
  const { id, note } = req.body as { id?: string; note?: string };

  if (!id) {
    return res.status(400).json({ error: 'Missing required field: id' });
  }

  const found = resolveUnhandledLog(id, note);

  if (!found) {
    return res.status(404).json({ error: `Log entry "${id}" not found.` });
  }

  res.json({ success: true, message: `Log entry "${id}" resolved.` });
});

export default router;