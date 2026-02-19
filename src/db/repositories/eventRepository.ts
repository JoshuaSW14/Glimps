/**
 * Event Repository
 * SECURITY: Every query is scoped to userId. No NULL user_id fallbacks.
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
  async create(input: CreateEventInput, client?: PoolClient): Promise<Event> {
    const db = client || getPool();
    const query = `
      INSERT INTO events (
        start_time, end_time, title, summary, location_name,
        location_lat, location_lng, confidence_score, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`;
    const values = [
      input.startTime,
      input.endTime,
      input.title,
      input.summary ?? null,
      input.locationName ?? null,
      input.locationLat ?? null,
      input.locationLng ?? null,
      input.confidenceScore,
      input.userId,
    ];
    try {
      const result = await db.query<EventRow>(query, values);
      return mapEventRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create event', { error });
    }
  }

  /**
   * SECURITY: Always requires userId — returns NotFoundError for wrong owner.
   */
  async findById(id: string, userId: string, client?: PoolClient): Promise<Event> {
    const db = client || getPool();
    const result = await db.query<EventRow>(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Event', id);
    return mapEventRow(result.rows[0]);
  }

  async update(id: string, userId: string, input: UpdateEventInput, client?: PoolClient): Promise<Event> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.startTime !== undefined)      { updates.push(`start_time = $${p++}`);       values.push(input.startTime); }
    if (input.endTime !== undefined)        { updates.push(`end_time = $${p++}`);         values.push(input.endTime); }
    if (input.title !== undefined)          { updates.push(`title = $${p++}`);            values.push(input.title); }
    if (input.summary !== undefined)        { updates.push(`summary = $${p++}`);          values.push(input.summary); }
    if (input.locationName !== undefined)   { updates.push(`location_name = $${p++}`);    values.push(input.locationName); }
    if (input.locationLat !== undefined)    { updates.push(`location_lat = $${p++}`);     values.push(input.locationLat); }
    if (input.locationLng !== undefined)    { updates.push(`location_lng = $${p++}`);     values.push(input.locationLng); }
    if (input.confidenceScore !== undefined){ updates.push(`confidence_score = $${p++}`); values.push(input.confidenceScore); }

    updates.push('updated_at = NOW()');

    if (updates.length === 1) return this.findById(id, userId, client);

    values.push(id, userId);
    const query = `
      UPDATE events SET ${updates.join(', ')}
      WHERE id = $${p} AND user_id = $${p + 1}
      RETURNING *`;
    try {
      const result = await db.query<EventRow>(query, values);
      if (result.rows.length === 0) throw new NotFoundError('Event', id);
      return mapEventRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update event', { error });
    }
  }

  /** SECURITY: userId is required — no OR user_id IS NULL fallback. */
  async listRecent(limit: number = 20, userId: string): Promise<Event[]> {
    const pool = getPool();
    const result = await pool.query<EventRow>(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY start_time DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows.map(mapEventRow);
  }

  /** Find events containing a specific memory, scoped to userId via JOIN. */
  async findByMemoryId(memoryId: string, userId: string, client?: PoolClient): Promise<Event[]> {
    const db = client || getPool();
    const result = await db.query<EventRow>(
      `SELECT e.*
       FROM events e
       INNER JOIN memory_event_links mel ON e.id = mel.event_id
       WHERE mel.memory_id = $1 AND e.user_id = $2
       ORDER BY e.start_time DESC`,
      [memoryId, userId]
    );
    return result.rows.map(mapEventRow);
  }

  /** Internal update — pipeline use only, no user check. */
  async updateInternal(id: string, input: UpdateEventInput, client?: PoolClient): Promise<Event> {
    const db = client || getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (input.startTime !== undefined)      { updates.push(`start_time = $${p++}`);       values.push(input.startTime); }
    if (input.endTime !== undefined)        { updates.push(`end_time = $${p++}`);         values.push(input.endTime); }
    if (input.title !== undefined)          { updates.push(`title = $${p++}`);            values.push(input.title); }
    if (input.summary !== undefined)        { updates.push(`summary = $${p++}`);          values.push(input.summary); }
    if (input.locationName !== undefined)   { updates.push(`location_name = $${p++}`);    values.push(input.locationName); }
    if (input.locationLat !== undefined)    { updates.push(`location_lat = $${p++}`);     values.push(input.locationLat); }
    if (input.locationLng !== undefined)    { updates.push(`location_lng = $${p++}`);     values.push(input.locationLng); }
    if (input.confidenceScore !== undefined){ updates.push(`confidence_score = $${p++}`); values.push(input.confidenceScore); }
    updates.push('updated_at = NOW()');
    if (updates.length === 1) {
      const existing = await db.query<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
      if (existing.rows.length === 0) throw new NotFoundError('Event', id);
      return mapEventRow(existing.rows[0]);
    }
    values.push(id);
    const query = `UPDATE events SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`;
    try {
      const result = await db.query<EventRow>(query, values);
      if (result.rows.length === 0) throw new NotFoundError('Event', id);
      return mapEventRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update event', { error });
    }
  }

  /** Internal findByMemoryId — pipeline use only, no user scope check. */
  async findByMemoryIdInternal(memoryId: string, client?: PoolClient): Promise<Event[]> {
    const db = client || getPool();
    const result = await db.query<EventRow>(
      `SELECT e.* FROM events e
       INNER JOIN memory_event_links mel ON e.id = mel.event_id
       WHERE mel.memory_id = $1 ORDER BY e.start_time DESC`,
      [memoryId]
    );
    return result.rows.map(mapEventRow);
  }

  /** Internal delete — used by pipeline/admin only, no user check. */
  async delete(id: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    const result = await db.query('DELETE FROM events WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new NotFoundError('Event', id);
  }
}

export const eventRepository = new EventRepository();
