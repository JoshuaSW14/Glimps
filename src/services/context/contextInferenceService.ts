/**
 * Context Inference Service
 * After a memory is embedded, search similar memories and infer place/people/tags as AI suggestions.
 */

import {
  memoryEmbeddingRepository,
  memoryContextRepository,
  memoryTagRepository,
  memoryPeopleRepository,
} from '../../db/repositories';
import { logger } from '../../utils/logger';
import { TagOrigin } from '../../types';

const SIMILAR_MEMORIES_LIMIT = 15;
const MIN_OCCURRENCES_FOR_PLACE = 1;
const MIN_OCCURRENCES_FOR_PERSON = 2;
const MIN_OCCURRENCES_FOR_TAG = 2;
const MAX_INFERRED_PEOPLE = 5;
const MAX_INFERRED_TAGS = 10;

export class ContextInferenceService {
  /**
   * For a given memory, find similar memories and infer place, people, tags. Store as AI suggestions (not confirmed).
   */
  async inferAndStoreContext(memoryId: string, userId: string | undefined): Promise<void> {
    const embedding = await memoryEmbeddingRepository.findByMemoryId(memoryId);
    if (!embedding) {
      logger.debug('No embedding for memory, skipping context inference', { memoryId });
      return;
    }

    const similar = await memoryEmbeddingRepository.findSimilar(
      embedding.embedding,
      SIMILAR_MEMORIES_LIMIT + 1,
      undefined,
      userId ?? undefined
    );
    const similarIds = similar
      .filter((s) => s.memoryId !== memoryId)
      .slice(0, SIMILAR_MEMORIES_LIMIT)
      .map((s) => s.memoryId);

    if (similarIds.length === 0) {
      logger.debug('No similar memories for context inference', { memoryId });
      return;
    }

    const [contextMap, tagsMap, peopleMap] = await Promise.all([
      memoryContextRepository.findByMemoryIds(similarIds),
      memoryTagRepository.findByMemoryIds(similarIds),
      memoryPeopleRepository.findByMemoryIds(similarIds),
    ]);

    const inferredPlace = this.inferPlace(Array.from(contextMap.values()));
    const inferredPeople = this.inferPeople(peopleMap);
    const inferredTags = this.inferTags(tagsMap);

    if (inferredPlace) {
      await memoryContextRepository.upsert({
        memoryId,
        locationName: inferredPlace.locationName,
        latitude: inferredPlace.latitude,
        longitude: inferredPlace.longitude,
        confirmed: false,
      });
    }

    for (const p of inferredPeople) {
      await memoryPeopleRepository.create({
        memoryId,
        personName: p.name,
        confidence: p.confidence,
        confirmed: false,
      });
    }

    for (const t of inferredTags) {
      await memoryTagRepository.create({
        memoryId,
        tag: t.tag,
        confidence: t.confidence,
        origin: TagOrigin.AI,
      });
    }

    logger.info('Context inference completed', {
      memoryId,
      similarCount: similarIds.length,
      hasPlace: !!inferredPlace,
      peopleCount: inferredPeople.length,
      tagsCount: inferredTags.length,
    });
  }

  private inferPlace(contexts: Array<{ locationName?: string | null; latitude?: number | null; longitude?: number | null }>): { locationName?: string; latitude?: number; longitude?: number } | null {
    const withLocation = contexts.filter(
      (c) => (c.locationName != null && c.locationName !== '') || (c.latitude != null && c.longitude != null)
    );
    if (withLocation.length < MIN_OCCURRENCES_FOR_PLACE) return null;

    const byName = new Map<string, number>();
    let sumLat = 0;
    let sumLon = 0;
    let countCoords = 0;
    for (const c of withLocation) {
      if (c.locationName) byName.set(c.locationName, (byName.get(c.locationName) ?? 0) + 1);
      if (c.latitude != null && c.longitude != null) {
        sumLat += c.latitude;
        sumLon += c.longitude;
        countCoords++;
      }
    }
    let locationName: string | undefined;
    let maxCount = 0;
    byName.forEach((count, name) => {
      if (count > maxCount) {
        maxCount = count;
        locationName = name;
      }
    });
    const latitude = countCoords > 0 ? sumLat / countCoords : undefined;
    const longitude = countCoords > 0 ? sumLon / countCoords : undefined;
    if (!locationName && latitude === undefined) return null;
    return { locationName, latitude, longitude };
  }

  private inferPeople(peopleMap: Map<string, Array<{ personName: string; confidence?: number | null }>>): Array<{ name: string; confidence: number }> {
    const counts = new Map<string, number>();
    for (const list of peopleMap.values()) {
      for (const p of list) {
        const name = p.personName.trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const entries = Array.from(counts.entries())
      .filter(([, count]) => count >= MIN_OCCURRENCES_FOR_PERSON)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_INFERRED_PEOPLE);
    return entries.map(([name, count]) => ({
      name,
      confidence: Math.min(0.99, 0.5 + (count / (SIMILAR_MEMORIES_LIMIT + 1)) * 0.5),
    }));
  }

  private inferTags(tagsMap: Map<string, Array<{ tag: string; confidence?: number | null }>>): Array<{ tag: string; confidence: number }> {
    const counts = new Map<string, number>();
    for (const list of tagsMap.values()) {
      for (const t of list) {
        const tag = t.tag.trim().toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const entries = Array.from(counts.entries())
      .filter(([, count]) => count >= MIN_OCCURRENCES_FOR_TAG)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_INFERRED_TAGS);
    return entries.map(([tag, count]) => ({
      tag,
      confidence: Math.min(0.99, 0.5 + (count / (SIMILAR_MEMORIES_LIMIT + 1)) * 0.5),
    }));
  }
}

export const contextInferenceService = new ContextInferenceService();
