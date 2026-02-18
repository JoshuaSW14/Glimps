/**
 * Memory Repository
 * Phase 2: Data access for memories table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  Memory,
  CreateMemoryInput,
  MemoryRow,
  mapMemoryRow,
} from '../../types';
import { NotFoundError, DatabaseError } from '../../utils/errors';

export class MemoryRepository {
  /**
   * Create a new memory
   */
  async create(
    input: CreateMemoryInput,
    client?: PoolClient
  ): Promise<Memory> {
    const db = client || getPool();
    
    const hasUserId = 'userId' in input && input.userId != null;
    const query = hasUserId
      ? `INSERT INTO memories (
          memory_source_id, user_id, recorded_at, modality, raw_text, normalized_text,
          ai_summary, latitude, longitude, location_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`
      : `INSERT INTO memories (
          memory_source_id, recorded_at, modality, raw_text, normalized_text,
          ai_summary, latitude, longitude, location_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`;
    const values = hasUserId
      ? [
          input.memorySourceId,
          input.userId,
          input.recordedAt,
          input.modality,
          input.rawText,
          input.normalizedText,
          input.aiSummary || null,
          input.latitude || null,
          input.longitude || null,
          input.locationName || null,
        ]
      : [
          input.memorySourceId,
          input.recordedAt,
          input.modality,
          input.rawText,
          input.normalizedText,
          input.aiSummary || null,
          input.latitude || null,
          input.longitude || null,
          input.locationName || null,
        ];
    
    try {
      const result = await db.query<MemoryRow>(query, values);
      return mapMemoryRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory', { error });
    }
  }
  
  /**
   * Get memory by ID
   */
  async findById(id: string, client?: PoolClient): Promise<Memory> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM memories WHERE id = $1';
    
    const result = await db.query<MemoryRow>(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Memory', id);
    }
    
    return mapMemoryRow(result.rows[0]);
  }
  
  /**
   * Get memory by source ID
   */
  async findBySourceId(sourceId: string, client?: PoolClient): Promise<Memory | null> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM memories WHERE memory_source_id = $1';
    
    const result = await db.query<MemoryRow>(query, [sourceId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapMemoryRow(result.rows[0]);
  }
  
  /**
   * List recent memories (optionally scoped to user)
   */
  async listRecent(limit: number = 20, userId?: string): Promise<Memory[]> {
    const pool = getPool();
    const byUser = userId != null;
    const query = byUser
      ? `SELECT * FROM memories WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT $2`
      : `SELECT * FROM memories ORDER BY recorded_at DESC LIMIT $1`;
    const values = byUser ? [userId, limit] : [limit];
    const result = await pool.query<MemoryRow>(query, values);
    return result.rows.map(mapMemoryRow);
  }
}

export const memoryRepository = new MemoryRepository();
