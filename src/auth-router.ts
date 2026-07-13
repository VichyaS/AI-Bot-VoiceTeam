import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { signToken, type UserRole } from './auth-jwt.js';
import { findUserByUsername } from './user-store.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(64).trim(),
  password: z.string().min(1).max(128),
});

/**
 * POST /api/admin/auth/login
 *
 * Validates the user's password against a bcrypt hash stored in the
 * ADMIN_PASSWORD_HASH environment variable. The ADMIN_USERNAME variable
 * (or a default of "admin") specifies the expected username.
 *
 * On success, returns a short-lived JWT (2 hours).
 *
 * Body: { username: string, password: string }
 */
router.post('/login', async (req: Request, res: Response) => {
  // Input validation
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid username or password format.' });
  }

  const { username, password } = parsed.data;

  // 1. Try the user store (users.json from seed-users)
  const storedUser = findUserByUsername(username);

  if (storedUser) {
    const passwordMatch = await bcrypt.compare(password, storedUser.passwordHash);
    if (!passwordMatch) {
      console.warn(`[auth] Failed login attempt for user: ${username}`);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Check account expiry
    if (storedUser.expiryDate) {
      const expiry = new Date(storedUser.expiryDate);
      if (expiry < new Date()) {
        console.warn(`[auth] Expired account login attempt: ${username}`);
        return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้หมดอายุแล้ว กรุณาติดต่อ Super Admin เพื่อต่ออายุ' });
      }
    }

    const token = signToken({ username, role: storedUser.role });
    console.log(`[auth] Successful login for user: ${username} (role: ${storedUser.role})`);
    return res.json({
      success: true,
      token,
      user: { username: storedUser.username, role: storedUser.role, displayName: storedUser.displayName },
    });
  }

  // 2. Fallback: env-based single user
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!passwordHash) {
    console.warn('[auth] No user store or ADMIN_PASSWORD_HASH configured.');
    return res.status(401).json({ error: 'Server authentication is not configured. Run `npm run seed-users`.' });
  }

  if (username !== expectedUser) {
    console.warn(`[auth] Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const passwordMatch = await bcrypt.compare(password, passwordHash);

  if (!passwordMatch) {
    console.warn(`[auth] Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const userRole: UserRole = (process.env.ADMIN_ROLE as UserRole) || 'IVR_MANAGER';
  const token = signToken({ username, role: userRole });
  console.log(`[auth] Successful login for user: ${username} (role: ${userRole})`);

  res.json({
    success: true,
    token,
    user: { username, role: userRole },
  });
});

export default router;