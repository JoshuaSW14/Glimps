/**
 * Memory Tag Repository
 * Data access for memory_tags table
 */

import { PoolClient } from 'pg';
import { getPool } from '../index';
import {
  MemoryTag,
  CreateMemoryTagInput,
  MemoryTagRow,
  mapMemoryTagRow,
} from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryTagRepository {
  async create(input: CreateMemoryTagInput, client?: PoolClient): Promise<MemoryTag> {
    const db = client || getPool();
    const query = `
      INSERT INTO memory_tags (memory_id, tag, confidence, origin)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [
      input.memoryId,
      input.tag,
      input.confidence ?? null,
      input.origin,
    ];
    try {
      const result = await db.query<MemoryTagRow>(query, values);
      return mapMemoryTagRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create memory tag', { error });
    }
  }

  async findByMemoryId(memoryId: string, client?: PoolClient): Promise<MemoryTag[]> {
    const db = client || getPool();
    const result = await db.query<MemoryTagRow>(
      'SELECT * FROM memory_tags WHERE memory_id = $1 ORDER BY tag',
      [memoryId]
    );
    return result.rows.map(mapMemoryTagRow);
  }

  async findByMemoryIds(memoryIds: string[], client?: PoolClient): Promise<Map<string, MemoryTag[]>> {
    if (memoryIds.length === 0) return new Map();
    const db = client || getPool();
    const result = await db.query<MemoryTagRow>(
      'SELECT * FROM memory_tags WHERE memory_id = ANY($1::uuid[]) ORDER BY memory_id, tag',
      [memoryIds]
    );
    const map = new Map<string, MemoryTag[]>();
    result.rows.forEach((row) => {
      const list = map.get(row.memory_id) ?? [];
      list.push(mapMemoryTagRow(row));
      map.set(row.memory_id, list);
    });
    return map;
  }

  async deleteByMemoryIdAndTag(memoryId: string, tag: string, client?: PoolClient): Promise<void> {
    const db = client || getPool();
    await db.query('DELETE FROM memory_tags WHERE memory_id = $1 AND tag = $2', [memoryId, tag]);
  }

  async replaceForMemory(memoryId: string, tags: { tag: string; origin: 'ai' | 'user'; confidence?: number }[], client?: PoolClient): Promise<MemoryTag[]> {
    const db = client || getPool();
    await db.query('DELETE FROM memory_tags WHERE memory_id = $1', [memoryId]);
    if (tags.length === 0) return [];
    const out: MemoryTag[] = [];
    for (const t of tags) {
      const created = await this.create(
        { memoryId, tag: t.tag, origin: t.origin as any, confidence: t.confidence },
        client
      );
      out.push(created);
    }
    return out;
  }
}

export const memoryTagRepository = new MemoryTagRepository();
