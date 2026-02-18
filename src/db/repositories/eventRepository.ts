/**
 * Event Repository
 * Phase 1: Data access for events table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  Event,
  CreateEventInput,
  UpdateEventInput,
  EventRow,
  mapEventRow,
} from '../../types';
import { NotFoundError, DatabaseError } from '../../utils/errors';

export class EventRepository {
  /**
   * Create a new event
   */
  async create(
    input: CreateEventInput,
    client?: PoolClient
  ): Promise<Event> {
    const db = client || getPool();
    
    const hasUserId = 'userId' in input && input.userId != null;
    const query = hasUserId
      ? `INSERT INTO events (
          start_time, end_time, title, summary, location_name,
          location_lat, location_lng, confidence_score, user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`
      : `INSERT INTO events (
          start_time, end_time, title, summary, location_name,
          location_lat, location_lng, confidence_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`;
    const values = hasUserId
      ? [
          input.startTime,
          input.endTime,
          input.title,
          input.summary || null,
          input.locationName || null,
          input.locationLat || null,
          input.locationLng || null,
          input.confidenceScore,
          input.userId,
        ]
      : [
          input.startTime,
          input.endTime,
          input.title,
          input.summary || null,
          input.locationName || null,
          input.locationLat || null,
          input.locationLng || null,
          input.confidenceScore,
        ];
    
    try {
      const result = await db.query<EventRow>(query, values);
      return mapEventRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create event', { error });
    }
  }
  
  /**
   * Get event by ID
   */
  async findById(id: string, client?: PoolClient): Promise<Event> {
    const db = client || getPool();
    
    const query = 'SELECT * FROM events WHERE id = $1';
    
    const result = await db.query<EventRow>(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Event', id);
    }
    
    return mapEventRow(result.rows[0]);
  }
  
  /**
   * Update an event
   */
  async update(
    id: string,
    input: UpdateEventInput,
    client?: PoolClient
  ): Promise<Event> {
    const db = client || getPool();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (input.startTime !== undefined) {
      updates.push(`start_time = $${paramCount++}`);
      values.push(input.startTime);
    }
    if (input.endTime !== undefined) {
      updates.push(`end_time = $${paramCount++}`);
      values.push(input.endTime);
    }
    if (input.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(input.title);
    }
    if (input.summary !== undefined) {
      updates.push(`summary = $${paramCount++}`);
      values.push(input.summary);
    }
    if (input.locationName !== undefined) {
      updates.push(`location_name = $${paramCount++}`);
      values.push(input.locationName);
    }
    if (input.locationLat !== undefined) {
      updates.push(`location_lat = $${paramCount++}`);
      values.push(input.locationLat);
    }
    if (input.locationLng !== undefined) {
      updates.push(`location_lng = $${paramCount++}`);
      values.push(input.locationLng);
    }
    if (input.confidenceScore !== undefined) {
      updates.push(`confidence_score = $${paramCount++}`);
      values.push(input.confidenceScore);
    }
    
    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    
    if (updates.length === 1) {
      // Only updated_at changed, just return existing
      return this.findById(id, client);
    }
    
    values.push(id);
    const query = `
      UPDATE events
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    try {
      const result = await db.query<EventRow>(query, values);
      if (result.rows.length === 0) {
        throw new NotFoundError('Event', id);
      }
      return mapEventRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update event', { error });
    }
  }
  
  /**
   * List recent events (optionally scoped to user)
   */
  async listRecent(limit: number = 20, userId?: string): Promise<Event[]> {
    const pool = getPool();
    const byUser = userId != null;
    const query = byUser
      ? `SELECT * FROM events WHERE user_id = $1 ORDER BY start_time DESC LIMIT $2`
      : `SELECT * FROM events ORDER BY start_time DESC LIMIT $1`;
    const values = byUser ? [userId, limit] : [limit];
    const result = await pool.query<EventRow>(query, values);
    return result.rows.map(mapEventRow);
  }
  
  /**
   * Find events that contain a specific memory
   */
  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<Event[]> {
    const db = client || getPool();
    
    const query = `
      SELECT e.*
      FROM events e
      INNER JOIN memory_event_links mel ON e.id = mel.event_id
      WHERE mel.memory_id = $1
      ORDER BY e.start_time DESC
    `;
    
    const result = await db.query<EventRow>(query, [memoryId]);
    return result.rows.map(mapEventRow);
  }
  
  /**
   * Delete an event
   */
  async delete(id: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    
    const query = 'DELETE FROM events WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('Event', id);
    }
  }
}

export const eventRepository = new EventRepository();
