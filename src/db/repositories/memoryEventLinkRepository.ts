/**
 * Memory Event Link Repository
 * Phase 1: Data access for memory_event_links table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemoryEventLink,
  CreateMemoryEventLinkInput,
  MemoryEventLinkRow,
  mapMemoryEventLinkRow,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryEventLinkRepository {
  /**
   * Create a new memory-event link
   */
  async create(
    input: CreateMemoryEventLinkInput,
    client?: PoolClient
  ): Promise<MemoryEventLink> {
    const db = client || getPool();
    
    const query = `
      INSERT INTO memory_event_links (
        memory_id,
        event_id,
        relationship_type
      )
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const values = [
      input.memoryId,
      input.eventId,
      input.relationshipType,
    ];
    
    try {
      const result = await db.query<MemoryEventLinkRow>(query, values);
      return mapMemoryEventLinkRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory-event link', { error });
    }
  }
  
  /**
   * Find all links for an event
   */
  async findByEventId(eventId: string, client?: PoolClient): Promise<MemoryEventLink[]> {
    const db = client || getPool();
    
    const query = `
      SELECT * FROM memory_event_links
      WHERE event_id = $1
      ORDER BY created_at ASC
    `;
    
    const result = await db.query<MemoryEventLinkRow>(query, [eventId]);
    return result.rows.map(mapMemoryEventLinkRow);
  }
  
  /**
   * Find all links for a memory
   */
  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<MemoryEventLink[]> {
    const db = client || getPool();
    
    const query = `
      SELECT * FROM memory_event_links
      WHERE memory_id = $1
      ORDER BY created_at ASC
    `;
    
    const result = await db.query<MemoryEventLinkRow>(query, [memoryId]);
    return result.rows.map(mapMemoryEventLinkRow);
  }
  
  /**
   * Delete a specific link
   */
  async delete(
    memoryId: string,
    eventId: string,
    client?: PoolClient
  ): Promise<void> {
    const db = client || getPool();
    
    const query = `
      DELETE FROM memory_event_links
      WHERE memory_id = $1 AND event_id = $2
    `;
    
    await db.query(query, [memoryId, eventId]);
  }
  
  /**
   * Delete all links for an event
   */
  async deleteByEventId(eventId: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    
    const query = 'DELETE FROM memory_event_links WHERE event_id = $1';
    await db.query(query, [eventId]);
  }
  
  /**
   * Delete all links for a memory
   */
  async deleteByMemoryId(memoryId: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    
    const query = 'DELETE FROM memory_event_links WHERE memory_id = $1';
    await db.query(query, [memoryId]);
  }
  
  /**
   * Check if a memory is already linked to an event
   */
  async exists(
    memoryId: string,
    eventId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const db = client || getPool();
    
    const query = `
      SELECT 1 FROM memory_event_links
      WHERE memory_id = $1 AND event_id = $2
      LIMIT 1
    `;
    
    const result = await db.query(query, [memoryId, eventId]);
    return result.rows.length > 0;
  }
}

export const memoryEventLinkRepository = new MemoryEventLinkRepository();
