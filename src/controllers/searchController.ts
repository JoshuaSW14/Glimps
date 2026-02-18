/**
 * Search Controller
 * Phase 3: HTTP handlers for memory search
 */

import { Response, NextFunction } from 'express';
import { retrievalService } from '../services/retrieval/retrievalService';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';

export class SearchController {
  /**
   * POST /api/search
   * Search for memories using natural language query (scoped to authenticated user)
   */
  async search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, filters } = req.body;
      
      if (!query || typeof query !== 'string') {
        throw new ValidationError('Query is required and must be a string');
      }
      
      if (query.trim().length === 0) {
        throw new ValidationError('Query cannot be empty');
      }
      
      // Parse filters
      const searchFilters: any = {};
      
      if (filters) {
        if (filters.startDate) {
          searchFilters.startDate = new Date(filters.startDate);
        }
        
        if (filters.endDate) {
          searchFilters.endDate = new Date(filters.endDate);
        }
        
        if (filters.latitude !== undefined) {
          searchFilters.latitude = parseFloat(filters.latitude);
        }
        
        if (filters.longitude !== undefined) {
          searchFilters.longitude = parseFloat(filters.longitude);
        }
        
        if (filters.radiusKm !== undefined) {
          searchFilters.radiusKm = parseFloat(filters.radiusKm);
        }
        
        if (filters.limit !== undefined) {
          searchFilters.limit = parseInt(filters.limit, 10);
        }
      }
      
      logger.info('Search request', { query, filters: searchFilters });
      
      const result = await retrievalService.search(query, searchFilters, req.userId);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
