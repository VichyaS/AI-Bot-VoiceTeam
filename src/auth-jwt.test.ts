import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateAdmin } from './auth-jwt.js';

test('authenticateAdmin rejects unauthenticated requests when admin auth is not configured', () => {
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'test';

  const req: any = { headers: {} };
  let nextCalled = false;
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  authenticateAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error?.includes('Unauthorized') ?? false, true);
});
