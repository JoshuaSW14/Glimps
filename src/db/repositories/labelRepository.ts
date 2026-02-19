/**
 * Label Repository
 * User-defined labels (tags) for memories
 */

import { getPool } from '../index';
import { Label, CreateLabelInput, LabelRow, mapLabelRow, LabelKind } from '../../types';
import { NotFoundError, DatabaseError } from '../../utils/errors';

export class LabelRepository {
  async create(input: CreateLabelInput): Promise<Label> {
    const db = getPool();
    const kind = (input.kind || 'note') as LabelKind;
    const query = `
      INSERT INTO labels (user_id, name, kind)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    try {
      const result = await db.query<LabelRow>(query, [input.userId, input.name, kind]);
      return mapLabelRow(result.rows[0]);
    } catch (error) {
      throw new DatabaseError('Failed to create label', { error });
    }
  }

  async findByUserId(userId: string): Promise<Label[]> {
    const db = getPool();
    const result = await db.query<LabelRow>(
      'SELECT * FROM labels WHERE user_id = $1 ORDER BY name ASC',
      [userId]
    );
    return result.rows.map(mapLabelRow);
  }

  /** SECURITY: Always requires userId — returns NotFoundError for wrong owner. */
  async findById(id: string, userId: string): Promise<Label> {
    const db = getPool();
    const result = await db.query<LabelRow>(
      'SELECT * FROM labels WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Label', id);
    }
    return mapLabelRow(result.rows[0]);
  }

  async update(id: string, userId: string, data: { name?: string; kind?: LabelKind }): Promise<Label> {
    const db = getPool();
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.kind !== undefined) {
      updates.push(`kind = $${idx++}`);
      values.push(data.kind);
    }
    if (updates.length === 0) {
      return this.findById(id, userId);
    }
    values.push(id, userId);
    const query = `
      UPDATE labels SET ${updates.join(', ')}
      WHERE id = $${idx++} AND user_id = $${idx}
      RETURNING *
    `;
    try {
      const result = await db.query<LabelRow>(query, values);
      if (result.rows.length === 0) {
        throw new NotFoundError('Label', id);
      }
      return mapLabelRow(result.rows[0]);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update label', { error });
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    const db = getPool();
    const result = await db.query('DELETE FROM labels WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Label', id);
    }
  }
}

export const labelRepository = new LabelRepository();
