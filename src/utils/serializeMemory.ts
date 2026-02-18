/**
 * Serialize Memory for API responses so frontend always receives camelCase and ISO date strings.
 */

import { Memory } from '../types';

export function serializeMemory(m: Memory): Record<string, unknown> {
  return {
    id: m.id,
    userId: m.userId ?? undefined,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    capturedAt: m.capturedAt instanceof Date ? m.capturedAt.toISOString() : m.capturedAt,
    source: m.source,
    mediaType: m.mediaType,
    storagePath: m.storagePath,
    transcript: m.transcript ?? undefined,
    aiSummary: m.aiSummary ?? undefined,
    processingStatus: m.processingStatus,
    latitude: m.latitude ?? undefined,
    longitude: m.longitude ?? undefined,
    locationName: m.locationName ?? undefined,
  };
}
