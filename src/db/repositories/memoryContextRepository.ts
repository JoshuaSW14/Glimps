/**
 * Memory Context Repository
 * Data access for memory_context table (1:1 with memories)
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemoryContext,
  CreateMemoryContextInput,
  UpdateMemoryContextInput,
  MemoryContextRow,
  mapMemoryContextRow,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryContextRepository {
  async create(input: CreateMemoryContextInput, client?: PoolClient): Promise<MemoryContext> {
    const db = client || getPool();
    const query = `
      INSERT INTO memory_context (memory_id, user_note, location_name, latitude, longitude, confirmed)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      input.memoryId,
      input.userNote ?? null,
      input.locationName ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.confirmed ?? false,
    ];
    try {
      const result = await db.query<MemoryContextRow>(query, values);
      return mapMemoryContextRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory context', { error });
    }
  }

  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<MemoryContext | null> {
    const db = client || getPool();
    const result = await db.query<MemoryContextRow>(
      'SELECT * FROM memory_context WHERE memory_id = $1',
      [memoryId]
    );
    if (result.rows.length === 0) return null;
    return mapMemoryContextRow(result.rows[0]);
  }

  async upsert(input: CreateMemoryContextInput & Partial<UpdateMemoryContextInput>, client?: PoolClient): Promise<MemoryContext> {
    const db = client || getPool();
    const query = `
      INSERT INTO memory_context (memory_id, user_note, location_name, latitude, longitude, confirmed)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (memory_id) DO UPDATE SET
        user_note = COALESCE(EXCLUDED.user_note, memory_context.user_note),
        location_name = COALESCE(EXCLUDED.location_name, memory_context.location_name),
        latitude = COALESCE(EXCLUDED.latitude, memory_context.latitude),
        longitude = COALESCE(EXCLUDED.longitude, memory_context.longitude),
        confirmed = COALESCE(EXCLUDED.confirmed, memory_context.confirmed)
      RETURNING *
    `;
    const values = [
      input.memoryId,
      input.userNote ?? null,
      input.locationName ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.confirmed ?? false,
    ];
    try {
      const result = await db.query<MemoryContextRow>(query, values);
      return mapMemoryContextRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to upsert memory context', { error });
    }
  }

  async update(memoryId: string, input: UpdateMemoryContextInput, client?: PoolClient): Promise<MemoryContext> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (input.userNote !== undefined) {
      updates.push(`user_note = $${i++}`);
      values.push(input.userNote);
    }
    if (input.locationName !== undefined) {
      updates.push(`location_name = $${i++}`);
      values.push(input.locationName);
    }
    if (input.latitude !== undefined) {
      updates.push(`latitude = $${i++}`);
      values.push(input.latitude);
    }
    if (input.longitude !== undefined) {
      updates.push(`longitude = $${i++}`);
      values.push(input.longitude);
    }
    if (input.confirmed !== undefined) {
      updates.push(`confirmed = $${i++}`);
      values.push(input.confirmed);
    }
    if (updates.length === 0) {
      const ctx = await this.findByMemoryId(memoryId, client);
      if (!ctx) throw new DatabaseError('Memory context not found', { memoryId });
      return ctx;
    }
    values.push(memoryId);
    const query = `
      UPDATE memory_context SET ${updates.join(', ')} WHERE memory_id = $${i} RETURNING *
    `;
    try {
      const result = await db.query<MemoryContextRow>(query, values);
      if (result.rows.length === 0) throw new DatabaseError('Memory context not found', { memoryId });
      return mapMemoryContextRow(result.rows[0]);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update memory context', { error });
    }
  }

  /** Batch load context by memory IDs (returns map memoryId -> context, only for IDs that have a row) */
  async findByMemoryIds(memoryIds: string[], client?: PoolClient): Promise<Map<string, MemoryContext>> {
    if (memoryIds.length === 0) return new Map();
    const db = client || getPool();
    const result = await db.query<MemoryContextRow>(
      'SELECT * FROM memory_context WHERE memory_id = ANY($1::uuid[])',
      [memoryIds]
    );
    const map = new Map<string, MemoryContext>();
    result.rows.forEach((row) => map.set(row.memory_id, mapMemoryContextRow(row)));
    return map;
  }
}

export const memoryContextRepository = new MemoryContextRepository();
