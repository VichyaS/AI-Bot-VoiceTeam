import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authenticateAdmin, authorizeRoles } from './auth-jwt.js';
import { getUsers, addUser, updateUser, deleteUser, findUserByUsername } from './user-store.js';
import { emitLog } from './system-logger.js';

const router = Router();
router.use(authenticateAdmin);
router.use(authorizeRoles('SUPER_ADMIN'));

const createUserSchema = z.object({
  username: z.string().min(2).max(64).trim(),
  password: z.string().min(4).max(128),
  role: z.enum(['SUPER_ADMIN', 'IVR_MANAGER']),
  expiryDate: z.string().max(10).optional(),
});

/* ── GET /api/admin/users ─────────────────────────────────────────── */

router.get('/users', (_req: Request, res: Response) => {
  const users = getUsers().map((u) => ({
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    expiryDate: u.expiryDate || '',
    status: u.expiryDate && new Date(u.expiryDate) < new Date() ? 'Expired' : 'Active',
  }));
  res.json({ count: users.length, users });
});

/* ── POST /api/admin/users ────────────────────────────────────────── */

router.post('/users', async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    }

    const { username, password, role, expiryDate } = parsed.data;

    // Check duplicate
    if (findUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    // Reject expired dates
    if (expiryDate && new Date(expiryDate) < new Date()) {
      return res.status(400).json({ error: 'Expiry date cannot be in the past.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    addUser({ username, passwordHash, role, displayName: username, expiryDate: expiryDate || '' });
    emitLog('INFO', `User '${username}' created with role ${role}`);

    res.json({ success: true, message: `User '${username}' created successfully.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ── PUT /api/admin/users/:username ───────────────────────────────── */

router.put('/users/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params as { username: string };
    const patch: Record<string, unknown> = {};

    if (req.body.role) patch.role = req.body.role;
    if (req.body.expiryDate !== undefined) patch.expiryDate = req.body.expiryDate;
    if (req.body.password) {
      patch.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    const ok = updateUser(username, patch);
    if (!ok) return res.status(404).json({ error: 'User not found.' });

    emitLog('INFO', `User '${username}' updated.`);
    res.json({ success: true, message: `User '${username}' updated.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ── DELETE /api/admin/users/:username ────────────────────────────── */

router.delete('/users/:username', (req: Request, res: Response) => {
  const { username } = req.params as { username: string };
  const ok = deleteUser(username);
  if (!ok) return res.status(404).json({ error: 'User not found.' });
  emitLog('INFO', `User '${username}' deleted.`);
  res.json({ success: true, message: `User '${username}' deleted.` });
});

export default router;