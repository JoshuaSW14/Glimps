/**
 * Retrieval Service
 * Hybrid ranking: 0.45 embedding + 0.20 temporal + 0.20 place + 0.10 people + 0.05 tags
 */

import {
  memoryRepository,
  memoryEmbeddingRepository,
  memoryContextRepository,
  memoryTagRepository,
  memoryPeopleRepository,
} from '../../db/repositories';
import { embeddingService } from '../ai';
import { logger } from '../../utils/logger';
import { Memory } from '../../types';
import { hybridScore } from './hybridScorer';

export interface SearchFilters {
  startDate?: Date;
  endDate?: Date;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit?: number;
}

export interface SearchResult {
  memory: Memory;
  score: number;
}

export interface RetrievalResult {
  results: SearchResult[];
  query: string;
  filters: SearchFilters;
  totalResults: number;
  searchTimeMs: number;
}

const CANDIDATE_MULTIPLIER = 8; // fetch 8x limit for re-ranking

export class RetrievalService {
  async search(
    query: string,
    filters: SearchFilters = {},
    userId: string
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const limit = filters.limit || 10;
    const candidateLimit = Math.min(limit * CANDIDATE_MULTIPLIER, 100);

    logger.info('Starting memory search (hybrid)', { query, filters, hasUserId: !!userId });

    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      const similar = await memoryEmbeddingRepository.findSimilar(
        queryEmbedding,
        candidateLimit,
        userId
      );

      if (similar.length === 0) {
        return {
          results: [],
          query,
          filters,
          totalResults: 0,
          searchTimeMs: Date.now() - startTime,
        };
      }

      const memoryIds = similar.map((s) => s.memoryId);
      const [memories, contextMap, tagsMap, peopleMap] = await Promise.all([
        memoryRepository.findByIds(memoryIds, userId),
        memoryContextRepository.findByMemoryIds(memoryIds),
        memoryTagRepository.findByMemoryIds(memoryIds),
        memoryPeopleRepository.findByMemoryIds(memoryIds),
      ]);

      const memoryById = new Map<string, Memory>();
      for (const m of memories) {
        const ctx = contextMap.get(m.id);
        memoryById.set(m.id, {
          ...m,
          latitude: ctx?.latitude ?? undefined,
          longitude: ctx?.longitude ?? undefined,
          locationName: ctx?.locationName ?? undefined,
        });
      }

      let scored: Array<{ memory: Memory; score: number; breakdown: any }> = [];
      for (let i = 0; i < similar.length; i++) {
        const { memoryId, distance } = similar[i];
        const memory = memoryById.get(memoryId);
        if (!memory) continue;
        if (filters.startDate || filters.endDate) {
          const capturedAt = new Date(memory.capturedAt);
          if (filters.startDate && capturedAt < filters.startDate) continue;
          if (filters.endDate && capturedAt > filters.endDate) continue;
        }
        if (
          filters.latitude !== undefined &&
          filters.longitude !== undefined &&
          filters.radiusKm !== undefined
        ) {
          if (memory.latitude == null || memory.longitude == null) continue;
          const d = this.calculateDistance(
            filters.latitude,
            filters.longitude,
            memory.latitude,
            memory.longitude
          );
          if (d > filters.radiusKm) continue;
        }
        const embeddingSim = Math.max(0, 1 - distance);
        const out = hybridScore({
          memory,
          embeddingSimilarity: embeddingSim,
          context: contextMap.get(memoryId) ?? null,
          tags: tagsMap.get(memoryId) ?? [],
          people: peopleMap.get(memoryId) ?? [],
        });
        scored.push({ memory, score: out.score, breakdown: out.breakdown });
      }

      scored.sort((a, b) => b.score - a.score);
      const results: SearchResult[] = scored.slice(0, limit).map(({ memory, score }) => ({ memory, score }));

      const searchTimeMs = Date.now() - startTime;
      logger.info('Memory search completed (hybrid)', {
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

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const retrievalService = new RetrievalService();
