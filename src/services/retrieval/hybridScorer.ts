/**
 * Hybrid score for memory retrieval
 * score = 0.45 embedding + 0.20 temporal + 0.20 place + 0.10 people + 0.05 tags
 */

import { Memory, MemoryContext, MemoryTag, MemoryPerson } from '../../types';

const W_EMBED = 0.45;
const W_TEMPORAL = 0.2;
const W_PLACE = 0.2;
const W_PEOPLE = 0.1;
const W_TAGS = 0.05;

/** Reference time for temporal proximity (e.g. query date or now) */
export interface ScorerInput {
  memory: Memory;
  embeddingSimilarity: number; // 0-1, higher = more similar
  context: MemoryContext | null;
  tags: MemoryTag[];
  people: MemoryPerson[];
  referenceTime?: Date; // optional query time for temporal boost
}

export interface ScorerOutput {
  score: number;
  breakdown: {
    embedding: number;
    temporal: number;
    place: number;
    people: number;
    tags: number;
  };
}

/**
 * Compute hybrid score. If memory has no context, temporal/place/people/tags contribute 0 (embedding-only).
 */
export function hybridScore(input: ScorerInput): ScorerOutput {
  const embed = Math.max(0, Math.min(1, input.embeddingSimilarity));
  const refTime = input.referenceTime ?? new Date();
  const memTime = input.memory.capturedAt instanceof Date ? input.memory.capturedAt : new Date(input.memory.capturedAt);

  let temporal = 0;
  const diffMs = Math.abs(refTime.getTime() - memTime.getTime());
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  if (diffDays <= 1) temporal = 1;
  else if (diffDays <= 7) temporal = 0.7;
  else if (diffDays <= 30) temporal = 0.3;

  const place = input.context && (input.context.locationName != null || (input.context.latitude != null && input.context.longitude != null)) ? 1 : 0;
  const people = input.people.length > 0 ? 1 : 0;
  const tags = input.tags.length > 0 ? 1 : 0;

  const score =
    W_EMBED * embed +
    W_TEMPORAL * temporal +
    W_PLACE * place +
    W_PEOPLE * people +
    W_TAGS * tags;

  return {
    score,
    breakdown: {
      embedding: W_EMBED * embed,
      temporal: W_TEMPORAL * temporal,
      place: W_PLACE * place,
      people: W_PEOPLE * people,
      tags: W_TAGS * tags,
    },
  };
}
