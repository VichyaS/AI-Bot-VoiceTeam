import { Router, type Request, type Response } from 'express';
import { authenticateAdmin, authorizeRoles } from './auth-jwt.js';
import { getCallStats, getCallStatsCsv } from './call-stats.js';

const router = Router();

router.use(authenticateAdmin);
router.use(authorizeRoles('SUPER_ADMIN', 'IVR_MANAGER'));

/**
 * GET /api/admin/call-stats
 *
 * Returns aggregated call statistics.
 * Query: ?days=30 (default 365)
 */
router.get('/call-stats', (req: Request, res: Response) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 365, 1), 365);
  const stats = getCallStats(days);
  res.json(stats);
});

/**
 * GET /api/admin/call-stats/csv
 *
 * Downloads call history as CSV.
 * Query: ?days=30 (default 365)
 */
router.get('/call-stats/csv', (req: Request, res: Response) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 365, 1), 365);
  const csv = getCallStatsCsv(days);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="call-history-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
