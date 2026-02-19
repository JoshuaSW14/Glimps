/**
 * Upload endpoint tests
 * Phase 6: Verify signature verification and metadata persistence
 */

import request from 'supertest';
import crypto from 'crypto';

// Mock heavy dependencies before app import
jest.mock('../services/storage/storageService', () => ({
  storageService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    storeFileFromBuffer: jest.fn().mockResolvedValue({ path: '/stored/test-file.m4a' }),
  },
}));

jest.mock('../services/pipeline/memoryPipeline', () => ({
  memoryPipeline: {
    processMemory: jest.fn().mockResolvedValue({
      memory: {
        id: 'mem-id-1',
        userId: 'user-id-1',
        capturedAt: new Date(),
        source: 'upload',
        mediaType: 'audio',
        storagePath: '/stored/test-file.m4a',
        processingStatus: 'complete',
        transcript: null,
        summary: null,
        locationName: null,
      },
      processingTimeMs: 100,
    }),
  },
}));

jest.mock('../db/repositories/memoryRepository', () => ({
  memoryRepository: {
    create: jest.fn().mockResolvedValue({
      id: 'mem-id-1',
      userId: 'user-id-1',
      capturedAt: new Date(),
      source: 'upload',
      mediaType: 'audio',
      storagePath: '/stored/test-file.m4a',
      processingStatus: 'pending',
    }),
  },
}));

jest.mock('../db/repositories/memoryContextRepository', () => ({
  memoryContextRepository: {
    upsert: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../db', () => ({
  getPool: jest.fn().mockReturnValue({ query: jest.fn().mockResolvedValue({ rows: [] }) }),
  withTransaction: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../services/auth/authService', () => ({
  authService: {
    verifyToken: jest.fn().mockImplementation((t) => {
      if (t === 'valid-test-token') return { userId: 'test-user-id' };
      throw new Error('invalid token');
    }),
    generateToken: jest.fn().mockReturnValue('test-token'),
    verifyAppleToken: jest.fn(),
    verifyGoogleToken: jest.fn(),
    authenticateApple: jest.fn(),
    authenticateGoogle: jest.fn(),
  },
}));

import { app } from '../app';
import { memoryContextRepository } from '../db/repositories/memoryContextRepository';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';

function makeSignedUploadUrl(userId: string, fileType: 'voice' | 'image'): { url: string; fileKey: string } {
  const ext = fileType === 'voice' ? 'm4a' : 'jpg';
  const fileKey = `${userId}/${Date.now()}-abc123.${ext}`;
  const expiresAt = Date.now() + 3600 * 1000;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${fileKey}:${expiresAt}`)
    .digest('hex');
  const url = `/api/upload/signed?fileKey=${encodeURIComponent(fileKey)}&signature=${signature}&expires=${expiresAt}`;
  return { url, fileKey };
}

const VALID_USER_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789'; // valid UUID

describe('POST /api/upload/signed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 on missing/invalid signature parameters', async () => {
    const res = await request(app)
      .post('/api/upload/signed')
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');
    expect(res.status).toBe(400); // missing params → ValidationError
    expect(res.body.ok).toBe(false);
  });

  it('returns 403 on tampered signature', async () => {
    const { url } = makeSignedUploadUrl(VALID_USER_ID, 'voice');
    const tamperedUrl = url.replace('&signature=', '&signature=aaaa');

    const res = await request(app)
      .post(tamperedUrl)
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it('returns 201 and creates memory + context when location metadata is provided', async () => {
    const { url } = makeSignedUploadUrl(VALID_USER_ID, 'voice');
    const capturedAt = new Date().toISOString();

    const res = await request(app)
      .post(url)
      .field('capturedAt', capturedAt)
      .field('latitude', '51.5074')
      .field('longitude', '-0.1278')
      .field('locationName', 'London')
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.memory).toBeDefined();

    // Context repo was called with location data
    expect(memoryContextRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 51.5074,
        longitude: -0.1278,
        locationName: 'London',
      })
    );
  });

  it('returns 201 without calling context upsert when no location is provided', async () => {
    const { url } = makeSignedUploadUrl(VALID_USER_ID, 'voice');

    const res = await request(app)
      .post(url)
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(memoryContextRepository.upsert).not.toHaveBeenCalled();
  });

  it('persists notes in initial context when provided', async () => {
    const { url } = makeSignedUploadUrl(VALID_USER_ID, 'voice');

    const res = await request(app)
      .post(url)
      .field('notes', "This is my sister's birthday party")
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(memoryContextRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userNote: "This is my sister's birthday party",
      })
    );
  });

  it('rejects notes longer than 500 characters', async () => {
    const { url } = makeSignedUploadUrl(VALID_USER_ID, 'voice');
    const veryLongNote = 'a'.repeat(501);

    const res = await request(app)
      .post(url)
      .field('notes', veryLongNote)
      .attach('file', Buffer.from('audio data'), 'voice_memory.m4a');

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
