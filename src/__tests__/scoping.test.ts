/**
 * User scoping tests (integration)
 * Phase 6: Verify cross-user data isolation at the repository level
 *
 * These tests require a real Postgres database. They are skipped automatically
 * if DATABASE_URL points to a non-reachable host.
 */

import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';

const DB_URL = process.env.DATABASE_URL || '';

async function getTestPool(): Promise<Pool> {
  const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 3000 });
  await pool.query('SELECT 1'); // throws if unreachable
  return pool;
}

describe('User scoping (integration)', () => {
  let pool: Pool | undefined;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    try {
      pool = await getTestPool();
    } catch {
      console.warn('Skipping scoping tests — no test DB reachable');
      return;
    }

    // Create two test users
    userAId = uuid();
    userBId = uuid();
    await pool.query(
      `INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)
       ON CONFLICT DO NOTHING`,
      [userAId, `test-a-${userAId}@test.com`, userBId, `test-b-${userBId}@test.com`]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Clean up test data
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userAId, userBId]]);
    await pool.end();
  });

  it('findById returns memory only for the owner', async () => {
    if (!pool) return; // skip: no test DB available
    const { memoryRepository } = await import('../db/repositories/memoryRepository');

    // Create a memory for user A
    const memory = await memoryRepository.create({
      userId: userAId,
      capturedAt: new Date(),
      source: 'upload' as any,
      mediaType: 'audio' as any,
      storagePath: '/test/path.m4a',
      processingStatus: 'pending' as any,
    });

    // User A can access it
    const found = await memoryRepository.findById(memory.id, userAId);
    expect(found.id).toBe(memory.id);

    // User B cannot access it — should throw NotFoundError
    const { NotFoundError } = await import('../utils/errors');
    await expect(memoryRepository.findById(memory.id, userBId)).rejects.toBeInstanceOf(NotFoundError);

    // Cleanup
    await pool.query('DELETE FROM memories WHERE id = $1', [memory.id]);
  });

  it('listRecent returns only the user\'s own memories', async () => {
    if (!pool) return; // skip: no test DB available
    const { memoryRepository } = await import('../db/repositories/memoryRepository');

    const memA = await memoryRepository.create({
      userId: userAId,
      capturedAt: new Date(),
      source: 'upload' as any,
      mediaType: 'audio' as any,
      storagePath: '/test/a.m4a',
      processingStatus: 'pending' as any,
    });
    const memB = await memoryRepository.create({
      userId: userBId,
      capturedAt: new Date(),
      source: 'upload' as any,
      mediaType: 'audio' as any,
      storagePath: '/test/b.m4a',
      processingStatus: 'pending' as any,
    });

    const listA = await memoryRepository.listRecent(100, userAId);
    const listB = await memoryRepository.listRecent(100, userBId);

    expect(listA.some((m) => m.id === memA.id)).toBe(true);
    expect(listA.some((m) => m.id === memB.id)).toBe(false);
    expect(listB.some((m) => m.id === memB.id)).toBe(true);
    expect(listB.some((m) => m.id === memA.id)).toBe(false);

    // Cleanup
    await pool.query('DELETE FROM memories WHERE id = ANY($1::uuid[])', [[memA.id, memB.id]]);
  });
});
