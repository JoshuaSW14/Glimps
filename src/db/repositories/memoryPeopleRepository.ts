/**
 * Memory People Repository
 * Data access for memory_people table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemoryPerson,
  CreateMemoryPersonInput,
  MemoryPersonRow,
  mapMemoryPersonRow,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryPeopleRepository {
  async create(input: CreateMemoryPersonInput, client?: PoolClient): Promise<MemoryPerson> {
    const db = client || getPool();
    const query = `
      INSERT INTO memory_people (memory_id, person_name, confidence, confirmed)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [
      input.memoryId,
      input.personName,
      input.confidence ?? null,
      input.confirmed ?? false,
    ];
    try {
      const result = await db.query<MemoryPersonRow>(query, values);
      return mapMemoryPersonRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory person', { error });
    }
  }

  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<MemoryPerson[]> {
    const db = client || getPool();
    const result = await db.query<MemoryPersonRow>(
      'SELECT * FROM memory_people WHERE memory_id = $1 ORDER BY person_name',
      [memoryId]
    );
    return result.rows.map(mapMemoryPersonRow);
  }

  async findByMemoryIds(memoryIds: string[], client?: PoolClient): Promise<Map<string, MemoryPerson[]>> {
    if (memoryIds.length === 0) return new Map();
    const db = client || getPool();
    const result = await db.query<MemoryPersonRow>(
      'SELECT * FROM memory_people WHERE memory_id = ANY($1::uuid[]) ORDER BY memory_id, person_name',
      [memoryIds]
    );
    const map = new Map<string, MemoryPerson[]>();
    result.rows.forEach((row) => {
      const list = map.get(row.memory_id) ?? [];
      list.push(mapMemoryPersonRow(row));
      map.set(row.memory_id, list);
    });
    return map;
  }

  async setConfirmed(memoryId: string, personName: string, confirmed: boolean, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    await db.query(
      'UPDATE memory_people SET confirmed = $1 WHERE memory_id = $2 AND person_name = $3',
      [confirmed, memoryId, personName]
    );
  }

  async deleteByMemoryIdAndPerson(memoryId: string, personName: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    await db.query('DELETE FROM memory_people WHERE memory_id = $1 AND person_name = $2', [memoryId, personName]);
  }
}

export const memoryPeopleRepository = new MemoryPeopleRepository();
