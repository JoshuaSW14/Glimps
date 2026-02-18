/**
 * Memory-Label Repository
 * Many-to-many links between memories and labels
 */

import { getPool } from '../index';
import { Label, LabelRow, mapLabelRow } from '../../types';
import { DatabaseError } from '../../utils/errors';

export class MemoryLabelRepository {
  async addLabelToMemory(memoryId: string, labelId: string): Promise<void> {
    const db = getPool();
    try {
      await db.query(
        `INSERT INTO memory_labels (memory_id, label_id) VALUES ($1, $2)
         ON CONFLICT (memory_id, label_id) DO NOTHING`,
        [memoryId, labelId]
      );
    } catch (error) {
      throw new DatabaseError('Failed to add label to memory', { error });
    }
  }

  async removeLabelFromMemory(memoryId: string, labelId: string): Promise<void> {
    const db = getPool();
    await db.query('DELETE FROM memory_labels WHERE memory_id = $1 AND label_id = $2', [memoryId, labelId]);
  }

  async getLabelIdsByMemoryId(memoryId: string): Promise<string[]> {
    const db = getPool();
    const result = await db.query<{ label_id: string }>(
      'SELECT label_id FROM memory_labels WHERE memory_id = $1',
      [memoryId]
    );
    return result.rows.map((r) => r.label_id);
  }

  async getLabelsByMemoryIds(memoryIds: string[]): Promise<Map<string, Label[]>> {
    if (memoryIds.length === 0) {
      return new Map();
    }
    const db = getPool();
    const result = await db.query<{ memory_id: string } & LabelRow>(
      `SELECT ml.memory_id, l.id, l.user_id, l.name, l.kind, l.created_at
       FROM memory_labels ml
       JOIN labels l ON l.id = ml.label_id
       WHERE ml.memory_id = ANY($1::uuid[])`,
      [memoryIds]
    );
    const map = new Map<string, Label[]>();
    for (const row of result.rows) {
      const { memory_id, ...labelRow } = row;
      const label = mapLabelRow(labelRow as LabelRow);
      const list = map.get(memory_id) ?? [];
      list.push(label);
      map.set(memory_id, list);
    }
    return map;
  }
}

export const memoryLabelRepository = new MemoryLabelRepository();
