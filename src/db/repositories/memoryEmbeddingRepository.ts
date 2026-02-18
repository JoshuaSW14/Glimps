/**
 * Memory Embedding Repository
 * Phase 2: Data access for memory_embeddings table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemoryEmbedding,
  CreateMemoryEmbeddingInput,
  MemoryEmbeddingRow,
  mapMemoryEmbeddingRow,
  formatVectorString,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryEmbeddingRepository {
  /**
   * Create a new memory embedding
   */
  async create(
    input: CreateMemoryEmbeddingInput,
    client?: PoolClient
  ): Promise<MemoryEmbedding> {
    const db = client || getPool();
    
    const query = `
      INSERT INTO memory_embeddings (memory_id, embedding, model_version)
      VALUES ($1, $2::vector, $3)
      RETURNING *
    `;
    
    const values = [
      input.memoryId,
      formatVectorString(input.embedding),
      input.modelVersion || 'text-embedding-3-large',
    ];
    
    try {
      const result = await db.query<MemoryEmbeddingRow>(query, values);
      return mapMemoryEmbeddingRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory embedding', { error });
    }
  }
  
  /**
   * Get embedding by memory ID
   */
  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<MemoryEmbedding | null> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM memory_embeddings WHERE memory_id = $1';
    
    const result = await db.query<MemoryEmbeddingRow>(query, [memoryId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapMemoryEmbeddingRow(result.rows[0]);
  }
  
  /**
   * Search for similar memories using vector similarity
   * Returns memory IDs ordered by cosine similarity (most similar first)
   */
  async findSimilar(
    queryEmbedding: number[],
    limit: number = 10,
    client?: PoolClient,
    userId?: string
  ): Promise<Array<{ memoryId: string; distance: number }>> {
    const db = client || getPool();
    const byUser = userId != null;
    const query = byUser
      ? `
      SELECT me.memory_id, me.embedding <=> $1::vector AS distance
      FROM memory_embeddings me
      INNER JOIN memories m ON m.id = me.memory_id AND m.user_id = $3
      ORDER BY me.embedding <=> $1::vector
      LIMIT $2
    `
      : `
      SELECT memory_id, embedding <=> $1::vector AS distance
      FROM memory_embeddings
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    const values = byUser
      ? [formatVectorString(queryEmbedding), limit, userId]
      : [formatVectorString(queryEmbedding), limit];
    
    try {
      const result = await db.query<{ memory_id: string; distance: number }>(
        query,
        values
      );
      
      return result.rows.map(row => ({
        memoryId: row.memory_id,
        distance: row.distance,
      }));
    } catch (error) {
      throw new DatabaseError('Failed to search similar memories', { error });
    }
  }
}

export const memoryEmbeddingRepository = new MemoryEmbeddingRepository();
