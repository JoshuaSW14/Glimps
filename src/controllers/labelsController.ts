/**
 * Labels Controller
 * CRUD for user-defined labels (tags)
 */

import { Response, NextFunction } from 'express';
import { labelRepository } from '../db/repositories';
import { ValidationError } from '../utils/errors';
import { LabelKind } from '../types';
import { AuthRequest } from '../middleware/auth';

const VALID_KINDS: LabelKind[] = ['person', 'pet', 'event', 'place', 'note'];

export class LabelsController {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const labels = await labelRepository.findByUserId(userId);
      res.json({
        ok: true,
        data: { labels },
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { name, kind } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('name is required');
      }
      const labelKind = (kind && VALID_KINDS.includes(kind) ? kind : 'note') as LabelKind;
      const label = await labelRepository.create({
        userId,
        name: name.trim(),
        kind: labelKind,
      });
      res.status(201).json({
        ok: true,
        data: { label },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const { name, kind } = req.body;
      const updates: { name?: string; kind?: LabelKind } = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          throw new ValidationError('name must be a non-empty string');
        }
        updates.name = name.trim();
      }
      if (kind !== undefined) {
        if (!VALID_KINDS.includes(kind)) {
          throw new ValidationError(`kind must be one of: ${VALID_KINDS.join(', ')}`);
        }
        updates.kind = kind as LabelKind;
      }
      const label = await labelRepository.update(id, userId, updates);
      res.json({
        ok: true,
        data: { label },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      await labelRepository.delete(id, userId);
      res.json({
        ok: true,
        data: { deleted: true },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const labelsController = new LabelsController();
