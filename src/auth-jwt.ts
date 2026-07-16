import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

function getJwtSecret(): string | undefined {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  return undefined;
}

export type UserRole = 'SUPER_ADMIN' | 'IVR_MANAGER';

export interface JwtPayload {
  username: string;
  role: UserRole;
}

/**
 * Sign a JWT for the given user. Token expires in 2 hours.
 */
export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET must be set to a secret value of at least 32 characters in production.');
  }
  return jwt.sign(payload, secret, { expiresIn: '2h' });
}

/**
 * Verify and decode a JWT. Returns the payload or null.
 */
export function verifyToken(token: string): JwtPayload | null {
  const secret = getJwtSecret();
  if (!secret) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Express middleware that protects admin routes.
 *
 * Reads the JWT from the `Authorization: Bearer <token>` header.
 * If the token is missing, invalid, or expired, responds with 401.
 * On success, attaches the decoded payload to `req.user`.
 */
export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized. Provide a valid Bearer token.' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  // Attach user info so downstream handlers can read it
  (req as any).user = payload;
  next();
}

/**
 * Authorization middleware factory.
 *
 * Returns middleware that checks if the authenticated user's role is
 * included in the allowed roles list. If not, responds with 403 Forbidden.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 */
export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload | undefined;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized. No authentication found.' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      console.warn(`[auth] Role '${user.role}' not in [${allowedRoles.join(', ')}] for user '${user.username}'`);
      res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนงานนี้' });
      return;
    }

    next();
  };
}

export { getJwtSecret };