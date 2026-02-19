/**
 * Auth endpoint tests
 * Phase 6: Verify server-side token verification and envelope format
 */

import request from 'supertest';

// Mock auth service before importing app
jest.mock('../services/auth/authService', () => {
  const mockVerifyApple = jest.fn();
  const mockVerifyGoogle = jest.fn();
  const mockAuthApple = jest.fn();
  const mockAuthGoogle = jest.fn();
  const mockGenToken = jest.fn().mockReturnValue('test-session-token');

  const instance = {
    verifyAppleToken: mockVerifyApple,
    verifyGoogleToken: mockVerifyGoogle,
    authenticateApple: mockAuthApple,
    authenticateGoogle: mockAuthGoogle,
    generateToken: mockGenToken,
    verifyToken: jest.fn().mockImplementation((t) => {
      if (t === 'valid-test-token') return { userId: 'test-user-id' };
      throw new Error('invalid token');
    }),
  };

  return {
    authService: instance,
    AuthService: jest.fn().mockImplementation(() => instance),
  };
});

// Mock DB pool so health + auth routes don't need a real DB
jest.mock('../db', () => ({
  getPool: jest.fn().mockReturnValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  }),
  withTransaction: jest.fn().mockImplementation((fn) => fn({ query: jest.fn() })),
  closePool: jest.fn(),
}));

// Mock storage so app startup doesn't fail
jest.mock('../services/storage/storageService', () => ({
  storageService: { initialize: jest.fn().mockResolvedValue(undefined) },
}));

import { app } from '../app';
import { authService } from '../services/auth/authService';

describe('POST /api/auth/login', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when provider is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ idToken: 'some-token' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 when provider is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'facebook', idToken: 'some-token' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 when idToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'apple' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 401 when Apple token verification fails with invalid token error', async () => {
    (authService.verifyAppleToken as jest.Mock).mockRejectedValueOnce(
      new Error('invalid signature')
    );
    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'apple', idToken: 'bad-token' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('returns 401 when Google token verification fails with expired error', async () => {
    (authService.verifyGoogleToken as jest.Mock).mockRejectedValueOnce(
      new Error('Token used too late, 9999 > 9998: expired')
    );
    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'google', idToken: 'expired-token' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 200 with token on successful Apple login', async () => {
    (authService.verifyAppleToken as jest.Mock).mockResolvedValueOnce({
      sub: 'apple-sub-123',
      email: 'test@example.com',
    });
    (authService.authenticateApple as jest.Mock).mockResolvedValueOnce({
      userId: 'db-user-id',
      email: 'test@example.com',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'apple', idToken: 'valid-apple-token' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.token).toBe('test-session-token');
    expect(res.body.data.user.id).toBe('db-user-id');
  });

  it('returns 200 with token on successful Google login', async () => {
    (authService.verifyGoogleToken as jest.Mock).mockResolvedValueOnce({
      sub: 'google-sub-456',
      email: 'google@example.com',
      name: 'Test User',
    });
    (authService.authenticateGoogle as jest.Mock).mockResolvedValueOnce({
      userId: 'db-user-id-2',
      email: 'google@example.com',
      name: 'Test User',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ provider: 'google', idToken: 'valid-google-token' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });
});

describe('Legacy auth routes', () => {
  it('POST /api/auth/apple returns 410 Gone', async () => {
    const res = await request(app).post('/api/auth/apple').send({});
    expect(res.status).toBe(410);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('GONE');
  });

  it('POST /api/auth/google returns 410 Gone', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(410);
  });
});

describe('Protected routes', () => {
  it('returns 401 when no Bearer token is provided', async () => {
    const res = await request(app).get('/api/memories');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/memories')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
