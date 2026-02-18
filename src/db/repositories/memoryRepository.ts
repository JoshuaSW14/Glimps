/**
 * Memory Repository
 * Data access for memories table (semantic memory graph schema)
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
    const hasUserId = input.userId != null;
    const query = hasUserId
      ? `INSERT INTO memories (user_id, captured_at, source, media_type, storage_path, transcript, ai_summary, processing_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`
      : `INSERT INTO memories (captured_at, source, media_type, storage_path, transcript, ai_summary, processing_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`;
    const values = hasUserId
      ? [
          input.userId,
          input.capturedAt,
          input.source,
          input.mediaType,
          input.storagePath,
          input.transcript ?? null,
          input.aiSummary ?? null,
          input.processingStatus,
        ]
      : [
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
    } catch (error) {
      throw new DatabaseError('Failed to create memory', { error });
    }
  }

  async update(id: string, input: UpdateMemoryInput, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (input.capturedAt !== undefined) {
      updates.push(`captured_at = $${i++}`);
      values.push(input.capturedAt);
    }
    if (input.transcript !== undefined) {
      updates.push(`transcript = $${i++}`);
      values.push(input.transcript);
    }
    if (input.aiSummary !== undefined) {
      updates.push(`ai_summary = $${i++}`);
      values.push(input.aiSummary);
    }
    if (input.processingStatus !== undefined) {
      updates.push(`processing_status = $${i++}`);
      values.push(input.processingStatus);
    }
    if (updates.length === 0) {
      return this.findById(id, client);
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

  async findById(id: string, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    const result = await db.query<MemoryRow>('SELECT * FROM memories WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Memory', id);
    return mapMemoryRow(result.rows[0]);
  }

  /** Batch load memories by IDs (order not preserved) */
  async findByIds(ids: string[], client?: PoolClient): Promise<Memory[]> {
    if (ids.length === 0) return [];
    const db = client || getPool();
    const result = await db.query<MemoryRow>(
      'SELECT * FROM memories WHERE id = ANY($1::uuid[])',
      [ids]
    );
    return result.rows.map(mapMemoryRow);
  }

  /**
   * Load memory and attach location from memory_context (for event clustering and display)
   */
  async findByIdWithContext(id: string, client?: PoolClient): Promise<Memory> {
    const memory = await this.findById(id, client);
    const ctx = await memoryContextRepository.findByMemoryId(id, client);
    if (ctx) {
      (memory as Memory).latitude = ctx.latitude ?? undefined;
      (memory as Memory).longitude = ctx.longitude ?? undefined;
      (memory as Memory).locationName = ctx.locationName ?? undefined;
    }
    return memory;
  }

  async listRecent(limit: number = 20, userId?: string): Promise<Memory[]> {
    const pool = getPool();
    const byUser = userId != null;
    const query = byUser
      ? 'SELECT * FROM memories WHERE user_id = $1 ORDER BY captured_at DESC LIMIT $2'
      : 'SELECT * FROM memories ORDER BY captured_at DESC LIMIT $1';
    const values = byUser ? [userId, limit] : [limit];
    const result = await pool.query<MemoryRow>(query, values);
    return result.rows.map(mapMemoryRow);
  }

  /** List recent with context attached (lat/lon/locationName from memory_context) */
  async listRecentWithContext(limit: number = 20, userId?: string): Promise<Memory[]> {
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
}

export const memoryRepository = new MemoryRepository();
