import { Router, type Request, type Response } from 'express';
import { getConfig } from './config-manager.js';
import { findUserByUsername } from './user-store.js';
import { signToken, type UserRole } from './auth-jwt.js';

const router = Router();

/**
 * POST /api/admin/auth/mfa-login
 *
 * Accepts a Microsoft Entra ID ID token (obtained via MSAL on the frontend
 * after the user completes MFA), validates it, and issues a local JWT for
 * the admin dashboard API.
 *
 * Body: { idToken: string }
 */
router.post('/mfa-login', async (req: Request, res: Response) => {
  const cfg = getConfig();

  if (!cfg.mfaEnabled) {
    return res.status(400).json({ error: 'MFA login is not enabled on this server.' });
  }

  const { idToken, email } = req.body as { idToken?: string; email?: string };

  if (!idToken || !email) {
    return res.status(400).json({ error: 'Missing idToken or email.' });
  }

  // Validate domain
  const allowedDomain = cfg.mfaAllowedDomain?.trim().toLowerCase();
  if (allowedDomain) {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain || emailDomain !== allowedDomain) {
      console.warn(`[auth] MFA login rejected: email domain "${emailDomain}" not in allowed domain "${allowedDomain}"`);
      return res.status(403).json({ error: 'Your email domain is not allowed to access this system.' });
    }
  }

  // Check if this user exists in our user store (by matching email prefix as username)
  const username = email.split('@')[0];
  const storedUser = findUserByUsername(username);

  // If user exists in the store, use their role. Otherwise assign IVR_MANAGER.
  const role: UserRole = storedUser?.role || 'IVR_MANAGER';

  // Issue our local JWT
  const token = signToken({ username, role });

  console.log(`[auth] MFA login successful for: ${email} (role: ${role})`);
  return res.json({
    success: true,
    token,
    user: { username, role, displayName: storedUser?.displayName || username },
  });
});

export default router;