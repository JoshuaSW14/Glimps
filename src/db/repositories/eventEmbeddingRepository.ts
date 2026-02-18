/**
 * Event Embedding Repository
 * Phase 1: Data access for event_embeddings table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  EventEmbedding,
  CreateEventEmbeddingInput,
  EventEmbeddingRow,
  mapEventEmbeddingRow,
  formatVectorString,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class EventEmbeddingRepository {
  /**
   * Create a new event embedding
   */
  async create(
    input: CreateEventEmbeddingInput,
    client?: PoolClient
  ): Promise<EventEmbedding> {
    const db = client || getPool();
    
    const query = `
      INSERT INTO event_embeddings (event_id, embedding, model_version)
      VALUES ($1, $2::vector, $3)
      RETURNING *
    `;
    
    const values = [
      input.eventId,
      formatVectorString(input.embedding),
      input.modelVersion || 'text-embedding-3-large',
    ];
    
    try {
      const result = await db.query<EventEmbeddingRow>(query, values);
      return mapEventEmbeddingRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create event embedding', { error });
    }
  }
  
  /**
   * Get embedding by event ID
   */
  async findByEventId(eventId: string, client?: PoolClient): Promise<EventEmbedding | null> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM event_embeddings WHERE event_id = $1';
    
    const result = await db.query<EventEmbeddingRow>(query, [eventId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapEventEmbeddingRow(result.rows[0]);
  }
  
  /**
   * Upsert (create or replace) an event embedding
   * Useful for regenerating embeddings when event title/summary changes
   */
  async upsert(
    input: CreateEventEmbeddingInput,
    client?: PoolClient
  ): Promise<EventEmbedding> {
    const db = client || getPool();
    
    const query = `
      INSERT INTO event_embeddings (event_id, embedding, model_version)
      VALUES ($1, $2::vector, $3)
      ON CONFLICT (event_id)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        model_version = EXCLUDED.model_version,
        created_at = NOW()
      RETURNING *
    `;
    
    const values = [
      input.eventId,
      formatVectorString(input.embedding),
      input.modelVersion || 'text-embedding-3-large',
    ];
    
    try {
      const result = await db.query<EventEmbeddingRow>(query, values);
      return mapEventEmbeddingRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to upsert event embedding', { error });
    }
  }
  
  /**
   * Search for similar events using vector similarity
   * Returns event IDs ordered by cosine similarity (most similar first)
   */
  async findSimilar(
    queryEmbedding: number[],
    limit: number = 10,
    client?: PoolClient,
    userId?: string
  ): Promise<Array<{ eventId: string; distance: number }>> {
    const db = client || getPool();
    const byUser = userId != null;
    const query = byUser
      ? `
      SELECT ee.event_id, ee.embedding <=> $1::vector AS distance
      FROM event_embeddings ee
      INNER JOIN events e ON e.id = ee.event_id AND e.user_id = $3
      ORDER BY ee.embedding <=> $1::vector
      LIMIT $2
    `
      : `
      SELECT event_id, embedding <=> $1::vector AS distance
      FROM event_embeddings
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    const values = byUser
      ? [formatVectorString(queryEmbedding), limit, userId]
      : [formatVectorString(queryEmbedding), limit];
    
    try {
      const result = await db.query<{ event_id: string; distance: number }>(
        query,
        values
      );
      
      return result.rows.map(row => ({
        eventId: row.event_id,
        distance: row.distance,
      }));
    } catch (error) {
      throw new DatabaseError('Failed to search similar events', { error });
    }
  }
  
  /**
   * Delete event embedding
   */
  async delete(eventId: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    
    const query = 'DELETE FROM event_embeddings WHERE event_id = $1';
    await db.query(query, [eventId]);
  }
}

export const eventEmbeddingRepository = new EventEmbeddingRepository();
