/**
 * Resurfacing user-scoping tests
 * Phase 6: Verify GET /api/resurface/daily is scoped to the authenticated user
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';

// Mock event repository
const mockListRecent = jest.fn();
jest.mock('../db/repositories/eventRepository', () => ({
  eventRepository: {
    listRecent: mockListRecent,
  },
}));

// Mock retrieval log repository
const mockCreateLog = jest.fn().mockResolvedValue({});
jest.mock('../db/repositories/retrievalLogRepository', () => ({
  retrievalLogRepository: {
    create: mockCreateLog,
  },
}));

jest.mock('../db', () => ({
  getPool: jest.fn().mockReturnValue({ query: jest.fn().mockResolvedValue({ rows: [] }) }),
  withTransaction: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../services/storage/storageService', () => ({
  storageService: { initialize: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../services/auth/authService', () => {
  // Use the real jwt verify so signed test tokens are accepted
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
  return {
    authService: {
      verifyToken: jest.fn().mockImplementation((t: string) => jwt.verify(t, secret)),
      generateToken: jest.fn(),
    },
  };
});

import { app } from '../app';

function makeToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/resurface/daily', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/resurface/daily');
    expect(res.status).toBe(401);
  });

  it('calls eventRepository.listRecent with the authenticated userId', async () => {
    const userId = 'abcdef01-0000-0000-0000-000000000001';
    const token = makeToken(userId);

    // No eligible events (empty list → no-memory response)
    mockListRecent.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/resurface/daily')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify userId was passed to listRecent
    expect(mockListRecent).toHaveBeenCalledWith(500, userId);
  });

  it('does NOT call listRecent with the wrong userId', async () => {
    const userAId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const userBId = 'bbbbbbbb-0000-0000-0000-000000000001';
    const tokenA = makeToken(userAId);

    mockListRecent.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/resurface/daily')
      .set('Authorization', `Bearer ${tokenA}`);

    const calls = mockListRecent.mock.calls;
    expect(calls.every(([, uid]) => uid === userAId)).toBe(true);
    expect(calls.some(([, uid]) => uid === userBId)).toBe(false);
  });

  it('returns event data scoped to user when events exist', async () => {
    const userId = 'cccccccc-0000-0000-0000-000000000001';
    const token = makeToken(userId);

    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    mockListRecent.mockResolvedValueOnce([
      {
        id: 'event-1',
        userId,
        title: 'A great trip',
        summary: 'We visited a beautiful place and had an amazing time.',
        startTime: pastDate,
        endTime: new Date(pastDate.getTime() + 2 * 60 * 60 * 1000),
        confidenceScore: 0.9,
        locationName: 'Paris',
        locationLat: 48.8566,
        locationLng: 2.3522,
      },
    ]);

    const res = await request(app)
      .get('/api/resurface/daily')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.event).toBeDefined();
    expect(res.body.data.event.id).toBe('event-1');
    expect(res.body.data.notificationText).toContain('A great trip');
  });
});
