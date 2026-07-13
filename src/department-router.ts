import { Router, type Request, type Response } from 'express';
import { getConfig, updateConfig } from './config-manager.js';
import { authenticateAdmin, authorizeRoles } from './auth-jwt.js';
import { emitLog } from './system-logger.js';
import type { DepartmentEntry } from './services/routing-types.js';

const router = Router();
router.use(authenticateAdmin);
router.use(authorizeRoles('SUPER_ADMIN', 'IVR_MANAGER'));

/* ── Helpers ──────────────────────────────────────────────────────── */

function getDepartments(): DepartmentEntry[] {
  return getConfig().departments ?? [];
}

function saveDepartments(depts: DepartmentEntry[], action: string, deptName: string): void {
  // Update config (persists + hot-reloads)
  updateConfig({ departments: depts });

  // Broadcast to WebSocket console
  emitLog('INFO', `Department '${deptName}' was ${action}. Synonyms re-cached. Bot routing table successfully re-loaded.`);
}

/* ── GET /api/admin/departments ───────────────────────────────────── */

router.get('/departments', (_req: Request, res: Response) => {
  const depts = getDepartments();
  res.json({ count: depts.length, departments: depts });
});

/* ── POST /api/admin/departments — Append ─────────────────────────── */

router.post('/departments', (req: Request, res: Response) => {
  try {
    const entry = req.body as DepartmentEntry;

    if (!entry || !entry.name?.trim() || !entry.sipUri?.trim()) {
      return res.status(400).json({ error: 'Department must have a name and sipUri.' });
    }

    const current = getDepartments();
    current.push({
      name: entry.name.trim(),
      sipUri: entry.sipUri.trim(),
      aliases: entry.aliases ?? [],
    });

    saveDepartments(current, 'created', entry.name.trim());
    res.json({
      success: true,
      message: `สำเร็จ: บันทึกข้อมูลแผนก "${entry.name}" และอัปเดตระบบบอทเรียบร้อยแล้ว`,
      departments: current,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ── PUT /api/admin/departments/:index — Modify ─────────────────────── */

router.put('/departments/:index', (req: Request, res: Response) => {
  try {
    const index = parseInt(req.params.index as string, 10);
    const entry = req.body as DepartmentEntry;

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: 'Invalid department index.' });
    }
    if (!entry || !entry.name?.trim() || !entry.sipUri?.trim()) {
      return res.status(400).json({ error: 'Department must have a name and sipUri.' });
    }

    const current = getDepartments();
    if (index >= current.length) {
      return res.status(404).json({ error: `Department at index ${index} not found.` });
    }

    current[index] = {
      name: entry.name.trim(),
      sipUri: entry.sipUri.trim(),
      aliases: entry.aliases ?? [],
    };

    saveDepartments(current, 'updated', entry.name.trim());
    res.json({
      success: true,
      message: `สำเร็จ: แก้ไขข้อมูลแผนก "${entry.name}" และอัปเดตระบบบอทเรียบร้อยแล้ว`,
      departments: current,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ── DELETE /api/admin/departments/:index — Remove ─────────────────── */

router.delete('/departments/:index', (req: Request, res: Response) => {
  try {
    const index = parseInt(req.params.index as string, 10);

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: 'Invalid department index.' });
    }

    const current = getDepartments();
    if (index >= current.length) {
      return res.status(404).json({ error: `Department at index ${index} not found.` });
    }

    const removed = current[index];
    current.splice(index, 1);

    saveDepartments(current, 'deleted', removed.name);
    res.json({
      success: true,
      message: `สำเร็จ: ลบข้อมูลแผนก "${removed.name}" และอัปเดตระบบบอทเรียบร้อยแล้ว`,
      departments: current,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;