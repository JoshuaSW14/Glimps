/**
 * Domain types for Glimps
 * Phase 1: Core entities matching database schema
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum Modality {
  Voice = 'voice',
  Image = 'image',
}

export enum ProcessingStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

/** How the memory was captured */
export enum MemorySourceEnum {
  Camera = 'camera',
  Upload = 'upload',
  Voice = 'voice',
}

/** Media type of the memory */
export enum MediaType {
  Photo = 'photo',
  Audio = 'audio',
}

/** Origin of a tag (AI-inferred or user-set) */
export enum TagOrigin {
  AI = 'ai',
  User = 'user',
}

// ============================================================================
// MEMORY
// ============================================================================

/**
 * Memory: capture + transcript + summary + storage path.
 * Location/note live in memory_context; tags in memory_tags; people in memory_people.
 */
export interface Memory {
  id: string; // UUID
  userId: string; // NOT NULL after migration 006
  createdAt: Date;
  capturedAt: Date; // When the moment was captured (EXIF or user)
  source: MemorySourceEnum;
  mediaType: MediaType;
  storagePath: string;
  transcript?: string | null;
  aiSummary?: string | null;
  processingStatus: ProcessingStatus;
  // Resolved from memory_context when loaded with context (for event clustering, etc.)
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

/**
 * Input for creating a new memory (e.g. on upload, pending)
 */
export interface CreateMemoryInput {
  userId: string; // Required — every memory must belong to a user
  capturedAt: Date;
  source: MemorySourceEnum;
  mediaType: MediaType;
  storagePath: string;
  transcript?: string | null;
  aiSummary?: string | null;
  processingStatus: ProcessingStatus;
}

/**
 * Input for updating a memory (pipeline completion)
 */
export interface UpdateMemoryInput {
  capturedAt?: Date;
  transcript?: string | null;
  aiSummary?: string | null;
  processingStatus?: ProcessingStatus;
}

// ============================================================================
// MEMORY CONTEXT
// ============================================================================

export interface MemoryContext {
  memoryId: string;
  userNote?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confirmed: boolean;
}

export interface CreateMemoryContextInput {
  memoryId: string;
  userNote?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confirmed?: boolean;
}

export interface UpdateMemoryContextInput {
  userNote?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  confirmed?: boolean;
}

// ============================================================================
// MEMORY TAGS
// ============================================================================

export interface MemoryTag {
  id: string;
  memoryId: string;
  tag: string;
  confidence?: number | null;
  origin: TagOrigin;
}

export interface CreateMemoryTagInput {
  memoryId: string;
  tag: string;
  confidence?: number | null;
  origin: TagOrigin;
}

// ============================================================================
// MEMORY PEOPLE
// ============================================================================

export interface MemoryPerson {
  id: string;
  memoryId: string;
  personName: string;
  confidence?: number | null;
  confirmed: boolean;
}

export interface CreateMemoryPersonInput {
  memoryId: string;
  personName: string;
  confidence?: number | null;
  confirmed?: boolean;
}

/**
 * Location information
 */
export interface Location {
  latitude: number;
  longitude: number;
  locationName?: string;
}

// ============================================================================
// LABELS (user-defined tags)
// ============================================================================

export type LabelKind = 'person' | 'pet' | 'event' | 'place' | 'note';

export interface Label {
  id: string;
  userId: string;
  name: string;
  kind: LabelKind;
  createdAt: Date;
}

export interface CreateLabelInput {
  userId: string;
  name: string;
  kind?: LabelKind;
}

// ============================================================================
// MEMORY EMBEDDING
// ============================================================================

/**
 * Vector storage for semantic search (1:1 with memories)
 * Can be regenerated without touching memory content
 */
export interface MemoryEmbedding {
  id: string; // UUID
  memoryId: string; // UUID FK
  embedding: number[]; // 2000-dimensional vector (Neon HNSW limit)
  modelVersion: string; // e.g., 'text-embedding-3-large'
  createdAt: Date;
}

/**
 * Input for creating a new memory embedding
 */
export interface CreateMemoryEmbeddingInput {
  memoryId: string;
  embedding: number[];
  modelVersion?: string; // Defaults to 'text-embedding-3-large'
}

// ============================================================================
// RETRIEVAL LOG
// ============================================================================

/**
 * Audit trail for search queries
 * Supports explainability and debugging
 */
export interface RetrievalLog {
  id: string; // UUID
  createdAt: Date;
  userQuery: string;
  memoryIds: string[]; // Ordered by rank
  searchMetadata: SearchMetadata;
}

/**
 * Metadata stored with each retrieval log
 */
export interface SearchMetadata {
  /** Number of memories requested */
  k?: number;
  /** Similarity scores for returned memories */
  scores?: number[];
  /** Time-based filters applied */
  timeFilters?: {
    startDate?: Date;
    endDate?: Date;
  };
  /** Location-based filters applied */
  locationFilters?: {
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
  };
  /** Query latency in milliseconds */
  latencyMs?: number;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Input for creating a new retrieval log
 */
export interface CreateRetrievalLogInput {
  userId: string; // Required after migration 006
  userQuery: string;
  memoryIds: string[];
  searchMetadata?: SearchMetadata;
}

// ============================================================================
// DATABASE RESULT TYPES
// ============================================================================

/**
 * Raw database row from memories table (semantic memory graph schema)
 */
export interface MemoryRow {
  id: string;
  user_id: string;
  created_at: Date;
  captured_at: Date;
  source: string;
  media_type: string;
  storage_path: string;
  transcript: string | null;
  ai_summary: string | null;
  processing_status: string;
}

/**
 * Raw database row from memory_context table
 */
export interface MemoryContextRow {
  memory_id: string;
  user_note: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  confirmed: boolean;
}

/**
 * Raw database row from memory_tags table
 */
export interface MemoryTagRow {
  id: string;
  memory_id: string;
  tag: string;
  confidence: number | null;
  origin: string;
}

/**
 * Raw database row from memory_people table
 */
export interface MemoryPersonRow {
  id: string;
  memory_id: string;
  person_name: string;
  confidence: number | null;
  confirmed: boolean;
}

/**
 * Raw database row from memory_embeddings table
 */
export interface MemoryEmbeddingRow {
  id: string;
  memory_id: string;
  embedding: string; // pgvector returns as string
  model_version: string;
  created_at: Date;
}

/**
 * Raw database row from retrieval_logs table
 */
export interface RetrievalLogRow {
  id: string;
  created_at: Date;
  user_id: string;
  user_query: string;
  memory_ids: string[];
  search_metadata: any;
}

/**
 * Raw database row from labels table
 */
export interface LabelRow {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  created_at: Date;
}

// ============================================================================
// MAPPER FUNCTIONS
// ============================================================================

/**
 * Convert database row to Memory domain object (no context; use repository with context to attach location)
 */
export const mapMemoryRow = (row: MemoryRow): Memory => ({
  id: row.id,
  userId: row.user_id,
  createdAt: row.created_at,
  capturedAt: row.captured_at,
  source: row.source as MemorySourceEnum,
  mediaType: row.media_type as MediaType,
  storagePath: row.storage_path,
  transcript: row.transcript ?? undefined,
  aiSummary: row.ai_summary ?? undefined,
  processingStatus: row.processing_status as ProcessingStatus,
});

/**
 * Convert database row to MemoryContext domain object
 */
export const mapMemoryContextRow = (row: MemoryContextRow): MemoryContext => ({
  memoryId: row.memory_id,
  userNote: row.user_note ?? undefined,
  locationName: row.location_name ?? undefined,
  latitude: row.latitude ?? undefined,
  longitude: row.longitude ?? undefined,
  confirmed: row.confirmed,
});

/**
 * Convert database row to MemoryTag domain object
 */
export const mapMemoryTagRow = (row: MemoryTagRow): MemoryTag => ({
  id: row.id,
  memoryId: row.memory_id,
  tag: row.tag,
  confidence: row.confidence ?? undefined,
  origin: row.origin as TagOrigin,
});

/**
 * Convert database row to MemoryPerson domain object
 */
export const mapMemoryPersonRow = (row: MemoryPersonRow): MemoryPerson => ({
  id: row.id,
  memoryId: row.memory_id,
  personName: row.person_name,
  confidence: row.confidence ?? undefined,
  confirmed: row.confirmed,
});

/**
 * Convert database row to MemoryEmbedding domain object
 */
export const mapMemoryEmbeddingRow = (row: MemoryEmbeddingRow): MemoryEmbedding => ({
  id: row.id,
  memoryId: row.memory_id,
  embedding: parseVectorString(row.embedding),
  modelVersion: row.model_version,
  createdAt: row.created_at,
});

/**
 * Convert database row to RetrievalLog domain object
 */
export const mapRetrievalLogRow = (row: RetrievalLogRow): RetrievalLog => ({
  id: row.id,
  createdAt: row.created_at,
  userQuery: row.user_query,
  memoryIds: row.memory_ids,
  searchMetadata: row.search_metadata || {},
});

/**
 * Convert database row to Label domain object
 */
export const mapLabelRow = (row: LabelRow): Label => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  kind: row.kind as LabelKind,
  createdAt: row.created_at,
});

// ============================================================================
// EVENT DOMAIN MODEL (Phase 1)
// ============================================================================

/**
 * Relationship type between memory and event
 */
export enum RelationshipType {
  Primary = 'primary',       // Best single representation of the event
  Supporting = 'supporting', // Clear part of the same situation
  Context = 'context',       // Tangentially related (same place/time, less central)
}

// ============================================================================
// EVENT
// ============================================================================

/**
 * Event represents a real-world situation composed of multiple memories
 * Events are the unit of experience; memories are evidence
 */
export interface Event {
  id: string; // UUID
  userId: string; // NOT NULL after migration 006
  startTime: Date; // Earliest memory in event
  endTime: Date;   // Latest memory in event
  title: string;   // Short, human-readable
  summary?: string; // One-paragraph synthesis
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  confidenceScore: number; // 0-1
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  startTime: Date;
  endTime: Date;
  title: string;
  summary?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  confidenceScore: number;
  userId: string; // Required — every event must belong to a user
}

/**
 * Input for updating an event
 */
export interface UpdateEventInput {
  startTime?: Date;
  endTime?: Date;
  title?: string;
  summary?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  confidenceScore?: number;
}

// ============================================================================
// MEMORY EVENT LINK
// ============================================================================

/**
 * Many-to-many link between memories and events
 */
export interface MemoryEventLink {
  memoryId: string; // UUID FK
  eventId: string;  // UUID FK
  relationshipType: RelationshipType;
  createdAt: Date;
}

/**
 * Input for creating a memory-event link
 */
export interface CreateMemoryEventLinkInput {
  memoryId: string;
  eventId: string;
  relationshipType: RelationshipType;
}

// ============================================================================
// EVENT EMBEDDING
// ============================================================================

/**
 * Vector storage for event-level semantic search (1:1 with events)
 * Encodes situation (title+summary) not raw memory content
 */
export interface EventEmbedding {
  id: string; // UUID
  eventId: string; // UUID FK
  embedding: number[]; // 2000-dimensional vector (Neon HNSW limit)
  modelVersion: string; // e.g., 'text-embedding-3-large'
  createdAt: Date;
}

/**
 * Input for creating a new event embedding
 */
export interface CreateEventEmbeddingInput {
  eventId: string;
  embedding: number[];
  modelVersion?: string; // Defaults to 'text-embedding-3-large'
}

// ============================================================================
// EVENT DATABASE RESULT TYPES
// ============================================================================

/**
 * Raw database row from events table
 */
export interface EventRow {
  id: string;
  user_id: string;
  start_time: Date;
  end_time: Date;
  title: string;
  summary: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  confidence_score: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Raw database row from memory_event_links table
 */
export interface MemoryEventLinkRow {
  memory_id: string;
  event_id: string;
  relationship_type: string;
  created_at: Date;
}

/**
 * Raw database row from event_embeddings table
 */
export interface EventEmbeddingRow {
  id: string;
  event_id: string;
  embedding: string; // pgvector returns as string
  model_version: string;
  created_at: Date;
}

// ============================================================================
// EVENT MAPPERS
// ============================================================================

/**
 * Convert database row to Event domain object
 */
export const mapEventRow = (row: EventRow): Event => ({
  id: row.id,
  userId: row.user_id,
  startTime: row.start_time,
  endTime: row.end_time,
  title: row.title,
  summary: row.summary || undefined,
  locationName: row.location_name || undefined,
  locationLat: row.location_lat || undefined,
  locationLng: row.location_lng || undefined,
  confidenceScore: row.confidence_score,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Convert database row to MemoryEventLink domain object
 */
export const mapMemoryEventLinkRow = (row: MemoryEventLinkRow): MemoryEventLink => ({
  memoryId: row.memory_id,
  eventId: row.event_id,
  relationshipType: row.relationship_type as RelationshipType,
  createdAt: row.created_at,
});

/**
 * Convert database row to EventEmbedding domain object
 */
export const mapEventEmbeddingRow = (row: EventEmbeddingRow): EventEmbedding => ({
  id: row.id,
  eventId: row.event_id,
  embedding: parseVectorString(row.embedding),
  modelVersion: row.model_version,
  createdAt: row.created_at,
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse pgvector string representation to number array
 * pgvector returns vectors as strings like '[0.1, 0.2, 0.3]'
 */
export const parseVectorString = (vectorString: string): number[] => {
  // Remove brackets and split by comma
  const cleaned = vectorString.replace(/[\[\]]/g, '');
  return cleaned.split(',').map(s => parseFloat(s.trim()));
};

/**
 * Format number array as pgvector string
 * Converts [0.1, 0.2, 0.3] to '[0.1,0.2,0.3]'
 */
export const formatVectorString = (vector: number[]): string => {
  return `[${vector.join(',')}]`;
};
