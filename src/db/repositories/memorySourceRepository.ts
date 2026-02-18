/**
 * Memory Source Repository
 * Phase 2: Data access for memory_sources table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemorySource,
  CreateMemorySourceInput,
  MemorySourceRow,
  mapMemorySourceRow,
  ProcessingStatus,
} from '../../types';
import { NotFoundError, DatabaseError } from '../../utils/errors';

export class MemorySourceRepository {
  /**
   * Create a new memory source
   */
  async create(
    input: CreateMemorySourceInput,
    client?: PoolClient
  ): Promise<MemorySource> {
    const db = client || getPool();
    
    const hasUserId = input.userId != null;
    const query = hasUserId
      ? `INSERT INTO memory_sources (modality, storage_path, metadata, processing_status, user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`
      : `INSERT INTO memory_sources (modality, storage_path, metadata, processing_status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`;
    const values = hasUserId
      ? [
          input.modality,
          input.storagePath,
          JSON.stringify(input.metadata || {}),
          'pending',
          input.userId,
        ]
      : [
          input.modality,
          input.storagePath,
          JSON.stringify(input.metadata || {}),
          'pending',
        ];
    
    try {
      const result = await db.query<MemorySourceRow>(query, values);
      return mapMemorySourceRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory source', { error });
    }
  }
  
  /**
   * Get memory source by ID
   */
  async findById(id: string, client?: PoolClient): Promise<MemorySource> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM memory_sources WHERE id = $1';
    
    const result = await db.query<MemorySourceRow>(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('MemorySource', id);
    }
    
    return mapMemorySourceRow(result.rows[0]);
  }
  
  /**
   * Update processing status
   */
  async updateStatus(
    id: string,
    status: ProcessingStatus,
    errorMessage?: string,
    client?: PoolClient
  ): Promise<MemorySource> {
    const db = client || getPool();
    
    const query = `
      UPDATE memory_sources
      SET processing_status = $1, error_message = $2
      WHERE id = $3
      RETURNING *
    `;
    
    try {
      const result = await db.query<MemorySourceRow>(query, [
        status,
        errorMessage || null,
        id,
      ]);
      
      if (result.rows.length === 0) {
        throw new NotFoundError('MemorySource', id);
      }
      
      return mapMemorySourceRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update memory source status', { error });
    }
  }
  
  /**
   * List memory sources with optional filters
   */
  async list(options?: {
    status?: ProcessingStatus;
    limit?: number;
    offset?: number;
  }): Promise<MemorySource[]> {
    const pool = getPool();
    
    let query = 'SELECT * FROM memory_sources';
    const values: any[] = [];
    
    if (options?.status) {
      query += ' WHERE processing_status = $1';
      values.push(options.status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (options?.limit) {
      query += ` LIMIT $${values.length + 1}`;
      values.push(options.limit);
    }
    
    if (options?.offset) {
      query += ` OFFSET $${values.length + 1}`;
      values.push(options.offset);
    }
    
    const result = await pool.query<MemorySourceRow>(query, values);
    return result.rows.map(mapMemorySourceRow);
  }
}

export const memorySourceRepository = new MemorySourceRepository();
