/**
 * Event Formation Service
 * Phase 2: Orchestrate event creation and memory linking
 */

import {
  Memory,
  Event,
  CreateEventInput,
  RelationshipType,
} from '../../types';
import {
  eventRepository,
  memoryEventLinkRepository,
  memoryRepository,
  eventEmbeddingRepository,
} from '../../db/repositories';
import { eventClusteringService } from './eventClusteringService';
import { eventSynthesisService } from './eventSynthesisService';
import { embeddingService } from '../ai/embeddingService';
import { logger } from '../../utils/logger';
import { withTransaction } from '../../db';

/**
 * Result of event formation
 */
export interface FormationResult {
  event: Event;
  isNewEvent: boolean;
  linkedMemoryIds: string[];
}

export class EventFormationService {
  /**
   * Process a new memory: create event or attach to existing event.
   * Uses internal (no user check) methods — pipeline runs server-side with trusted memoryIds.
   */
  async processMemory(memoryId: string): Promise<FormationResult | null> {
    try {
      const memory = await memoryRepository.findByIdWithContextInternal(memoryId);

      // Find nearby memories (with context for location-aware clustering)
      const recentMemories = await memoryRepository.listRecentWithContextInternal(100);
      const nearbyMemories = await eventClusteringService.findNearbyMemories(
        memory,
        recentMemories
      );

      // Include the new memory in the cluster
      const clusterMemories = [memory, ...nearbyMemories];

      logger.info('Found nearby memories for event formation', {
        memoryId,
        nearbyCount: nearbyMemories.length,
      });

      // Check if any nearby memories are already in events
      const existingEvents = await this.findExistingEventsForMemories(
        nearbyMemories.map(m => m.id)
      );

      if (existingEvents.length > 0) {
        // Attach to existing event
        return await this.attachToExistingEvent(memory, existingEvents[0], clusterMemories);
      } else {
        // Create new event
        return await this.createNewEvent(clusterMemories);
      }
    } catch (error) {
      logger.error('Event formation failed', { error, memoryId });
      return null;
    }
  }

  /**
   * Find existing events that contain any of the given memory IDs
   */
  private async findExistingEventsForMemories(memoryIds: string[]): Promise<Event[]> {
    if (memoryIds.length === 0) {
      return [];
    }
    return eventRepository.findByMemoryIdInternal(memoryIds[0]);
  }

  /**
   * Create a new event from a cluster of memories
   */
  private async createNewEvent(memories: Memory[]): Promise<FormationResult> {
    return await withTransaction(async (client) => {
      // Analyze cluster
      const cluster = eventClusteringService.analyzeCluster(memories);

      // Generate title and summary
      const synthesis = await eventSynthesisService.synthesizeEvent({
        memories: cluster.clusterMemories,
      });

      // Calculate event time bounds
      const times = memories.map(m => m.capturedAt);
      const startTime = new Date(Math.min(...times.map(t => t.getTime())));
      const endTime = new Date(Math.max(...times.map(t => t.getTime())));

      // Extract location
      const location = eventClusteringService.extractClusterLocation(memories);

      // Create event — userId is required; use first memory's userId (guaranteed non-null post-migration)
      const userId = memories[0].userId;
      const eventInput: CreateEventInput = {
        startTime,
        endTime,
        title: synthesis.title,
        summary: synthesis.summary,
        confidenceScore: Math.max(cluster.clusterConfidence, synthesis.confidenceScore),
        userId,
        ...location,
      };

      const event = await eventRepository.create(eventInput, client);

      logger.info('Created new event', {
        eventId: event.id,
        title: event.title,
        memoryCount: memories.length,
        confidence: event.confidenceScore,
      });

      // Link memories to event
      const linkedMemoryIds: string[] = [];
      for (const memory of memories) {
        // First memory is primary, others are supporting
        const relationshipType = memory.id === memories[0].id
          ? RelationshipType.Primary
          : RelationshipType.Supporting;

        await memoryEventLinkRepository.create(
          {
            memoryId: memory.id,
            eventId: event.id,
            relationshipType,
          },
          client
        );

        linkedMemoryIds.push(memory.id);
      }

      // Generate and store event embedding
      const embeddingText = `${event.title}\n\n${event.summary || ''}`;
      const embedding = await embeddingService.generateEmbedding(embeddingText);

      await eventEmbeddingRepository.create(
        {
          eventId: event.id,
          embedding,
        },
        client
      );

      return {
        event,
        isNewEvent: true,
        linkedMemoryIds,
      };
    });
  }

  /**
   * Attach a memory to an existing event
   */
  private async attachToExistingEvent(
    newMemory: Memory,
    existingEvent: Event,
    allClusterMemories: Memory[]
  ): Promise<FormationResult> {
    return await withTransaction(async (client) => {
      // Get existing links for this event
      const existingLinks = await memoryEventLinkRepository.findByEventId(existingEvent.id, client);
      const existingMemoryIds = existingLinks.map(l => l.memoryId);

      // Check if memory is already linked
      if (existingMemoryIds.includes(newMemory.id)) {
        logger.info('Memory already linked to event', {
          memoryId: newMemory.id,
          eventId: existingEvent.id,
        });
        return {
          event: existingEvent,
          isNewEvent: false,
          linkedMemoryIds: [newMemory.id],
        };
      }

      // Link new memory as supporting
      await memoryEventLinkRepository.create(
        {
          memoryId: newMemory.id,
          eventId: existingEvent.id,
          relationshipType: RelationshipType.Supporting,
        },
        client
      );

      logger.info('Attached memory to existing event', {
        memoryId: newMemory.id,
        eventId: existingEvent.id,
        title: existingEvent.title,
      });

      // Check if event should be updated
      const shouldUpdate = eventSynthesisService.shouldUpdateEvent(
        existingLinks.length,
        1,
        existingEvent.updatedAt
      );

      let updatedEvent = existingEvent;

      if (shouldUpdate) {
        // Re-synthesize event with new memory included
        const synthesis = await eventSynthesisService.synthesizeEvent({
          memories: allClusterMemories,
          existingTitle: existingEvent.title,
          existingSummary: existingEvent.summary,
        });

        // Update event time bounds
        const allMemories = allClusterMemories;
        const times = allMemories.map(m => m.capturedAt);
        const startTime = new Date(Math.min(...times.map(t => t.getTime())));
        const endTime = new Date(Math.max(...times.map(t => t.getTime())));

        // Use internal update — pipeline has already verified ownership via formation chain
        updatedEvent = await eventRepository.updateInternal(
          existingEvent.id,
          {
            startTime,
            endTime,
            title: synthesis.title,
            summary: synthesis.summary,
            confidenceScore: synthesis.confidenceScore,
          },
          client
        );

        // Regenerate event embedding
        const embeddingText = `${updatedEvent.title}\n\n${updatedEvent.summary || ''}`;
        const embedding = await embeddingService.generateEmbedding(embeddingText);

        await eventEmbeddingRepository.upsert(
          {
            eventId: updatedEvent.id,
            embedding,
          },
          client
        );

        logger.info('Updated event with new memory', {
          eventId: updatedEvent.id,
          newTitle: updatedEvent.title,
        });
      }

      return {
        event: updatedEvent,
        isNewEvent: false,
        linkedMemoryIds: [newMemory.id],
      };
    });
  }
}

export const eventFormationService = new EventFormationService();
