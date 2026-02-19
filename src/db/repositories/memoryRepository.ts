/**
 * Memory Repository
 * SECURITY: Every query is scoped to userId. No NULL user_id fallbacks.
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemoryRow,
  mapMemoryRow,
} from '../../types';
import { memoryContextRepository } from './memoryContextRepository';
import { NotFoundError, DatabaseError } from '../../utils/errors';

export class MemoryRepository {
  async create(input: CreateMemoryInput, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const query = `
      INSERT INTO memories (user_id, captured_at, source, media_type, storage_path, transcript, ai_summary, processing_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`;
    const values = [
      input.userId,
      input.capturedAt,
      input.source,
      input.mediaType,
      input.storagePath,
      input.transcript ?? null,
      input.aiSummary ?? null,
      input.processingStatus,
    ];
    try {
      const result = await db.query<MemoryRow>(query, values);
      return mapMemoryRow(result.rows[0]);
    } catch (error: unknown) {
      const pg = error && typeof error === 'object' ? (error as { message?: string; code?: string; detail?: string }) : {};
      const msg = pg.message ?? (error instanceof Error ? error.message : String(error));
      const parts = [msg];
      if (pg.code) parts.push(`code=${pg.code}`);
      if (pg.detail) parts.push(pg.detail);
      throw new DatabaseError(`Failed to create memory: ${parts.join(', ')}`, { error, code: pg.code });
    }
  }

  /**
   * SECURITY: Always requires userId — returns NotFoundError for wrong owner (indistinguishable from missing).
   */
  async findById(id: string, userId: string, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const result = await db.query<MemoryRow>(
      'SELECT * FROM memories WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Memory', id);
    return mapMemoryRow(result.rows[0]);
  }

  /** Batch load memories by IDs, scoped to userId. */
  async findByIds(ids: string[], userId: string, client?: PoolClient): Promise<Memory[]> {
    if (ids.length === 0) return [];
    const db = client || getPool();
    const result = await db.query<MemoryRow>(
      'SELECT * FROM memories WHERE id = ANY($1::uuid[]) AND user_id = $2',
      [ids, userId]
    );
    return result.rows.map(mapMemoryRow);
  }

  async findByIdWithContext(id: string, userId: string, client?: PoolClient): Promise<Memory> {
    const memory = await this.findById(id, userId, client);
    const ctx = await memoryContextRepository.findByMemoryId(id, client);
    if (ctx) {
      (memory as Memory).latitude = ctx.latitude ?? undefined;
      (memory as Memory).longitude = ctx.longitude ?? undefined;
      (memory as Memory).locationName = ctx.locationName ?? undefined;
    }
    return memory;
  }

  /** SECURITY: userId is required — no OR user_id IS NULL fallback. */
  async listRecent(limit: number = 20, userId: string): Promise<Memory[]> {
    const pool = getPool();
    const result = await pool.query<MemoryRow>(
      'SELECT * FROM memories WHERE user_id = $1 ORDER BY captured_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map(mapMemoryRow);
  }

  async listRecentWithContext(limit: number = 20, userId: string): Promise<Memory[]> {
    const memories = await this.listRecent(limit, userId);
    if (memories.length === 0) return [];
    const ids = memories.map((m) => m.id);
    const contextMap = await memoryContextRepository.findByMemoryIds(ids);
    return memories.map((m) => {
      const ctx = contextMap.get(m.id);
      if (ctx) {
        return {
          ...m,
          latitude: ctx.latitude ?? undefined,
          longitude: ctx.longitude ?? undefined,
          locationName: ctx.locationName ?? undefined,
        };
      }
      return m;
    });
  }

  /** SECURITY: userId is included in WHERE to prevent cross-user updates. */
  async update(id: string, userId: string, input: UpdateMemoryInput, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (input.capturedAt !== undefined) { updates.push(`captured_at = $${i++}`); values.push(input.capturedAt); }
    if (input.transcript !== undefined) { updates.push(`transcript = $${i++}`); values.push(input.transcript); }
    if (input.aiSummary !== undefined) { updates.push(`ai_summary = $${i++}`); values.push(input.aiSummary); }
    if (input.processingStatus !== undefined) { updates.push(`processing_status = $${i++}`); values.push(input.processingStatus); }
    if (updates.length === 0) {
      return this.findById(id, userId, client);
    }
    values.push(id, userId);
    const query = `UPDATE memories SET ${updates.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`;
    try {
      const result = await db.query<MemoryRow>(query, values);
      if (result.rows.length === 0) throw new NotFoundError('Memory', id);
      return mapMemoryRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update memory', { error });
    }
  }

  /** Internal findByIdWithContext — pipeline/formation service use only. */
  async findByIdWithContextInternal(id: string, client?: PoolClient): Promise<Memory> {
    const memory = await this.findByIdInternal(id, client);
    const ctx = await memoryContextRepository.findByMemoryId(id, client);
    if (ctx) {
      (memory as Memory).latitude = ctx.latitude ?? undefined;
      (memory as Memory).longitude = ctx.longitude ?? undefined;
      (memory as Memory).locationName = ctx.locationName ?? undefined;
    }
    return memory;
  }

  /** Internal listRecent with context — pipeline/formation use only, no user scope. */
  async listRecentWithContextInternal(limit: number = 100, client?: PoolClient): Promise<Memory[]> {
    const db = client || getPool();
    const result = await db.query<MemoryRow>(
      'SELECT * FROM memories ORDER BY captured_at DESC LIMIT $1',
      [limit]
    );
    const memories = result.rows.map(mapMemoryRow);
    if (memories.length === 0) return [];
    const ids = memories.map((m) => m.id);
    const contextMap = await memoryContextRepository.findByMemoryIds(ids);
    return memories.map((m) => {
      const ctx = contextMap.get(m.id);
      if (ctx) {
        return {
          ...m,
          latitude: ctx.latitude ?? undefined,
          longitude: ctx.longitude ?? undefined,
          locationName: ctx.locationName ?? undefined,
        };
      }
      return m;
    });
  }

  /** Internal listAll — maintenance scripts only, no user scope. */
  async listAllInternal(limit: number = 5000, client?: PoolClient): Promise<Memory[]> {
    const db = client || getPool();
    const result = await db.query<MemoryRow>(
      'SELECT * FROM memories ORDER BY captured_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(mapMemoryRow);
  }

  /**
   * Internal findById used by the processing pipeline — no user check (pipeline runs server-side).
   * Only call from trusted pipeline code, never from a user-facing controller.
   */
  async findByIdInternal(id: string, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const result = await db.query<MemoryRow>('SELECT * FROM memories WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Memory', id);
    return mapMemoryRow(result.rows[0]);
  }

  /**
   * Internal update used by the processing pipeline — no user check (pipeline runs server-side).
   * Only call from trusted pipeline code, never from a user-facing controller.
   */
  async updateInternal(id: string, input: UpdateMemoryInput, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (input.capturedAt !== undefined) { updates.push(`captured_at = $${i++}`); values.push(input.capturedAt); }
    if (input.transcript !== undefined) { updates.push(`transcript = $${i++}`); values.push(input.transcript); }
    if (input.aiSummary !== undefined) { updates.push(`ai_summary = $${i++}`); values.push(input.aiSummary); }
    if (input.processingStatus !== undefined) { updates.push(`processing_status = $${i++}`); values.push(input.processingStatus); }
    if (updates.length === 0) {
      const existing = await db.query<MemoryRow>('SELECT * FROM memories WHERE id = $1', [id]);
      if (existing.rows.length === 0) throw new NotFoundError('Memory', id);
      return mapMemoryRow(existing.rows[0]);
    }
    values.push(id);
    const query = `UPDATE memories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`;
    try {
      const result = await db.query<MemoryRow>(query, values);
      if (result.rows.length === 0) throw new NotFoundError('Memory', id);
      return mapMemoryRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update memory', { error });
    }
  }
}

export const memoryRepository = new MemoryRepository();
