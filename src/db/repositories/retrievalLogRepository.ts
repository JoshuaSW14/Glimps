/**
 * Retrieval Log Repository
 * Phase 4: Data access for retrieval_logs table
 */

import { getPool } from '../index';
import {
  RetrievalLog,
  CreateRetrievalLogInput,
  RetrievalLogRow,
  mapRetrievalLogRow,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class RetrievalLogRepository {
  /**
   * Create a new retrieval log
   */
  async create(input: CreateRetrievalLogInput): Promise<RetrievalLog> {
    const pool = getPool();
    
    const query = `
      INSERT INTO retrieval_logs (user_query, memory_ids, search_metadata)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const values = [
      input.userQuery,
      input.memoryIds,
      JSON.stringify(input.searchMetadata || {}),
    ];
    
    try {
      const result = await pool.query<RetrievalLogRow>(query, values);
      return mapRetrievalLogRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create retrieval log', { error });
    }
  }
  
  /**
   * List recent retrieval logs
   */
  async listRecent(limit: number = 20): Promise<RetrievalLog[]> {
    const pool = getPool();
    
    const query = `
      SELECT * FROM retrieval_logs
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const result = await pool.query<RetrievalLogRow>(query, [limit]);
    return result.rows.map(mapRetrievalLogRow);
  }
}

export const retrievalLogRepository = new RetrievalLogRepository();
