/**
 * DB constraint tests (integration)
 * Phase 6: Verify user_id NOT NULL constraints after migration 006
 *
 * Skipped automatically if no test DB is reachable.
 */

import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';

const DB_URL = process.env.DATABASE_URL || '';

describe('DB NOT NULL constraints (integration)', () => {
  let pool: Pool | undefined;

  beforeAll(async () => {
    try {
      const p = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 3000 });
      await p.query('SELECT 1');
      pool = p; // only set if connection succeeds
    } catch {
      console.warn('Skipping migration tests — no test DB reachable');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('INSERT into memories with NULL user_id fails with 23502 constraint violation', async () => {
    if (!pool) return; // skip: no test DB available
    await expect(
      pool.query(
        `INSERT INTO memories (id, captured_at, source, media_type, storage_path, processing_status)
         VALUES ($1, NOW(), 'upload', 'audio', '/test/path', 'pending')`,
        [uuid()]
      )
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('INSERT into events with NULL user_id fails with 23502 constraint violation', async () => {
    if (!pool) return; // skip: no test DB available
    await expect(
      pool.query(
        `INSERT INTO events (id, title, start_time, end_time, confidence_score)
         VALUES ($1, 'Test', NOW(), NOW(), 0.5)`,
        [uuid()]
      )
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('retrieval_logs INSERT without user_id fails with 23502 constraint violation', async () => {
    if (!pool) return; // skip: no test DB available
    await expect(
      pool.query(
        `INSERT INTO retrieval_logs (id, user_query, memory_ids, search_metadata)
         VALUES ($1, 'test', '{}', '{}')`,
        [uuid()]
      )
    ).rejects.toMatchObject({ code: '23502' });
  });
});
