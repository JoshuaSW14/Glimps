/**
 * Retrieval Service
 * Phase 3: Semantic memory search with filtering
 */

import { memoryRepository, memoryEmbeddingRepository } from '../../db/repositories';
import { embeddingService } from '../ai';
import { logger } from '../../utils/logger';
import { Memory } from '../../types';

export interface SearchFilters {
  // Time-based filters
  startDate?: Date;
  endDate?: Date;
  
  // Location-based filters
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  
  // Result limits
  limit?: number;
}

export interface SearchResult {
  memory: Memory;
  score: number; // Similarity score (1 - distance, higher = more similar)
}

export interface RetrievalResult {
  results: SearchResult[];
  query: string;
  filters: SearchFilters;
  totalResults: number;
  searchTimeMs: number;
}

export class RetrievalService {
  /**
   * Search for memories using semantic similarity (optionally scoped to user)
   */
  async search(
    query: string,
    filters: SearchFilters = {},
    userId?: string
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    
    logger.info('Starting memory search', {
      query,
      filters,
      hasUserId: !!userId,
    });
    
    try {
      // Step 1: Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // Step 2: Vector similarity search
      const limit = filters.limit || 10;
      const similarMemories = await memoryEmbeddingRepository.findSimilar(
        queryEmbedding,
        limit * 3, // Get more candidates for filtering
        undefined,
        userId
      );
      
      // Step 3: Get full memory objects
      const memoryPromises = similarMemories.map(async (result) => {
        const memory = await memoryRepository.findById(result.memoryId);
        return {
          memory,
          distance: result.distance,
        };
      });
      
      const memoriesWithDistance = await Promise.all(memoryPromises);
      
      // Step 4: Apply filters
      let filteredMemories = memoriesWithDistance;
      
      // Time filter
      if (filters.startDate || filters.endDate) {
        filteredMemories = filteredMemories.filter(({ memory }) => {
          const recordedAt = new Date(memory.recordedAt);
          
          if (filters.startDate && recordedAt < filters.startDate) {
            return false;
          }
          
          if (filters.endDate && recordedAt > filters.endDate) {
            return false;
          }
          
          return true;
        });
      }
      
      // Location filter (simple radius check)
      if (
        filters.latitude !== undefined &&
        filters.longitude !== undefined &&
        filters.radiusKm !== undefined
      ) {
        filteredMemories = filteredMemories.filter(({ memory }) => {
          if (memory.latitude === undefined || memory.longitude === undefined) {
            return false;
          }
          
          const distance = this.calculateDistance(
            filters.latitude!,
            filters.longitude!,
            memory.latitude,
            memory.longitude
          );
          
          return distance <= filters.radiusKm!;
        });
      }
      
      // Step 5: Limit results and convert distance to score
      const results: SearchResult[] = filteredMemories
        .slice(0, limit)
        .map(({ memory, distance }) => ({
          memory,
          score: 1 - distance, // Convert distance to similarity score
        }));
      
      const searchTimeMs = Date.now() - startTime;
      
      logger.info('Memory search completed', {
        query,
        totalResults: results.length,
        searchTimeMs,
      });
      
      return {
        results,
        query,
        filters,
        totalResults: results.length,
        searchTimeMs,
      };
    } catch (error) {
      logger.error('Memory search failed', error, { query });
      throw error;
    }
  }
  
  /**
   * Calculate distance between two coordinates (Haversine formula)
   * Returns distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const retrievalService = new RetrievalService();
