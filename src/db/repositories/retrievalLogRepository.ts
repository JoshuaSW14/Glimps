/**
 * Retrieval Log Repository
 * SECURITY: userId is required on every write; reads are scoped to userId.
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
  async create(input: CreateRetrievalLogInput): Promise<RetrievalLog> {
    const pool = getPool();
    const query = `
      INSERT INTO retrieval_logs (user_id, user_query, memory_ids, search_metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const values = [
      input.userId,
      input.userQuery,
      input.memoryIds,
      JSON.stringify(input.searchMetadata ?? {}),
    ];
    try {
      const result = await pool.query<RetrievalLogRow>(query, values);
      return mapRetrievalLogRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create retrieval log', { error });
    }
  }

  async listRecent(userId: string, limit: number = 20): Promise<RetrievalLog[]> {
    const pool = getPool();
    const result = await pool.query<RetrievalLogRow>(
      'SELECT * FROM retrieval_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map(mapRetrievalLogRow);
  }
}

export const retrievalLogRepository = new RetrievalLogRepository();
