/**
 * Event Retrieval Service
 * Phase 3: Event-first semantic search
 */

import {
  Event,
  Memory,
  MemoryEventLink,
  RelationshipType,
} from '../../types';
import {
  eventRepository,
  eventEmbeddingRepository,
  memoryEventLinkRepository,
  memoryRepository,
} from '../../db/repositories';
import { embeddingService } from '../ai/embeddingService';
import { temporalParser } from './temporalParser';
import { logger } from '../../utils/logger';

/**
 * Search filters for event retrieval
 */
export interface EventSearchFilters {
  /** Filter by start time range */
  startTimeAfter?: Date;
  startTimeBefore?: Date;
  
  /** Filter by location proximity */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  
  /** Minimum confidence score */
  minConfidence?: number;
}

/**
 * Event with supporting memories
 */
export interface EventWithMemories {
  event: Event;
  primaryMemory?: Memory;
  supportingMemories: Memory[];
  contextMemories: Memory[];
  relevanceScore: number; // How relevant to the query
}

/**
 * Event retrieval result
 */
export interface EventRetrievalResult {
  events: EventWithMemories[];
  query: string;
  totalEvents: number;
  processingTimeMs: number;
}

export class EventRetrievalService {
  /**
   * Search for events using semantic similarity
   * Phase 4: With temporal reasoning
   */
  async search(
    query: string,
    limit: number = 10,
    filters: EventSearchFilters = {},
    userId?: string
  ): Promise<EventRetrievalResult> {
    const startTime = Date.now();
    
    logger.info('Event search started', { query, limit, filters });
    
    try {
      // Phase 4: Parse temporal intent
      const temporalIntent = temporalParser.parse(query);
      
      logger.info('Parsed temporal intent', {
        query,
        temporalType: temporalIntent.type,
        sortOrder: temporalIntent.sortOrder,
      });
      
      // Apply temporal filters to search filters
      const enhancedFilters = { ...filters };
      if (temporalIntent.startDate) {
        enhancedFilters.startTimeAfter = temporalIntent.startDate;
      }
      if (temporalIntent.endDate) {
        enhancedFilters.startTimeBefore = temporalIntent.endDate;
      }
      
      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // Search for similar events
      const similarEvents = await eventEmbeddingRepository.findSimilar(
        queryEmbedding,
        limit * 3, // Get more candidates for filtering and temporal sorting
        undefined,
        userId
      );
      
      logger.info('Found similar events', {
        count: similarEvents.length,
        query,
      });
      
      // Get full event data
      const eventsWithMemories: EventWithMemories[] = [];
      
      for (const { eventId, distance } of similarEvents) {
        try {
          const event = await eventRepository.findById(eventId);
          
          // Apply filters
          if (!this.matchesFilters(event, enhancedFilters)) {
            continue;
          }
          
          // Get memories for this event
          const links = await memoryEventLinkRepository.findByEventId(eventId);
          
          // Fetch memories and organize by relationship type
          const memories = await Promise.all(
            links.map(link => memoryRepository.findById(link.memoryId))
          );
          
          const primaryMemory = this.findPrimaryMemory(links, memories);
          const supportingMemories = this.findMemoriesByType(
            links,
            memories,
            RelationshipType.Supporting
          );
          const contextMemories = this.findMemoriesByType(
            links,
            memories,
            RelationshipType.Context
          );
          
          // Convert distance to relevance score (0-1, higher is better)
          // Cosine distance is [0, 2], where 0 is identical
          let relevanceScore = Math.max(0, 1 - distance / 2);
          
          // Phase 4: Boost score based on temporal relevance
          relevanceScore = this.applyTemporalBoost(event, temporalIntent, relevanceScore);
          
          eventsWithMemories.push({
            event,
            primaryMemory,
            supportingMemories,
            contextMemories,
            relevanceScore,
          });
        } catch (error) {
          logger.warn('Failed to fetch event details', { eventId, error });
        }
      }
      
      // Phase 4: Sort by temporal intent
      this.sortByTemporalIntent(eventsWithMemories, temporalIntent);
      
      // Take top results after sorting
      const finalResults = eventsWithMemories.slice(0, limit);
      
      const processingTimeMs = Date.now() - startTime;
      
      logger.info('Event search completed', {
        query,
        eventsFound: finalResults.length,
        temporalType: temporalIntent.type,
        processingTimeMs,
      });
      
      return {
        events: finalResults,
        query,
        totalEvents: finalResults.length,
        processingTimeMs,
      };
    } catch (error) {
      logger.error('Event search failed', { error, query });
      throw error;
    }
  }
  
  /**
   * Check if event matches filters
   */
  private matchesFilters(event: Event, filters: EventSearchFilters): boolean {
    // Time filters
    if (filters.startTimeAfter && event.startTime < filters.startTimeAfter) {
      return false;
    }
    if (filters.startTimeBefore && event.startTime > filters.startTimeBefore) {
      return false;
    }
    
    // Confidence filter
    if (filters.minConfidence && event.confidenceScore < filters.minConfidence) {
      return false;
    }
    
    // Location filter
    if (filters.latitude && filters.longitude && filters.radiusKm) {
      if (!event.locationLat || !event.locationLng) {
        return false;
      }
      
      const distance = this.calculateDistance(
        filters.latitude,
        filters.longitude,
        event.locationLat,
        event.locationLng
      );
      
      if (distance > filters.radiusKm * 1000) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Find primary memory from links
   */
  private findPrimaryMemory(
    links: MemoryEventLink[],
    memories: Memory[]
  ): Memory | undefined {
    const primaryLink = links.find(
      link => link.relationshipType === RelationshipType.Primary
    );
    
    if (!primaryLink) {
      return undefined;
    }
    
    return memories.find(m => m.id === primaryLink.memoryId);
  }
  
  /**
   * Find memories by relationship type
   */
  private findMemoriesByType(
    links: MemoryEventLink[],
    memories: Memory[],
    type: RelationshipType
  ): Memory[] {
    const typeLinks = links.filter(link => link.relationshipType === type);
    
    return typeLinks
      .map(link => memories.find(m => m.id === link.memoryId))
      .filter(Boolean) as Memory[];
  }
  
  /**
   * Calculate distance using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
  
  /**
   * Apply temporal boost to relevance score
   * Phase 4: Temporal reasoning
   */
  private applyTemporalBoost(
    event: Event,
    temporalIntent: any,
    baseScore: number
  ): number {
    if (temporalIntent.type === 'none') {
      return baseScore;
    }
    
    // For "first time" queries, boost older events
    if (temporalIntent.type === 'first') {
      const daysSinceEvent = (Date.now() - event.startTime.getTime()) / (24 * 60 * 60 * 1000);
      const ageBoost = Math.min(0.2, daysSinceEvent / 365 * 0.2); // Up to 0.2 boost for older events
      return Math.min(1, baseScore + ageBoost);
    }
    
    // For "last time" queries, boost more recent events
    if (temporalIntent.type === 'last') {
      const daysSinceEvent = (Date.now() - event.startTime.getTime()) / (24 * 60 * 60 * 1000);
      const recencyBoost = Math.max(0, 0.2 - (daysSinceEvent / 30 * 0.2)); // Up to 0.2 boost for recent events
      return Math.min(1, baseScore + recencyBoost);
    }
    
    // For "around" queries, boost events closest to reference date
    if (temporalIntent.type === 'around' && temporalIntent.referenceDate) {
      const daysDiff = Math.abs(
        event.startTime.getTime() - temporalIntent.referenceDate.getTime()
      ) / (24 * 60 * 60 * 1000);
      
      const proximityBoost = Math.max(0, 0.3 - (daysDiff / 7 * 0.3)); // Up to 0.3 boost for closer events
      return Math.min(1, baseScore + proximityBoost);
    }
    
    return baseScore;
  }
  
  /**
   * Sort events by temporal intent
   * Phase 4: Temporal reasoning
   */
  private sortByTemporalIntent(
    events: EventWithMemories[],
    temporalIntent: any
  ): void {
    if (temporalIntent.type === 'first') {
      // Oldest first
      events.sort((a, b) => a.event.startTime.getTime() - b.event.startTime.getTime());
    } else if (temporalIntent.type === 'last' || temporalIntent.type === 'recent') {
      // Newest first
      events.sort((a, b) => b.event.startTime.getTime() - a.event.startTime.getTime());
    } else {
      // Default: sort by relevance score (highest first)
      events.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  }
}

export const eventRetrievalService = new EventRetrievalService();
