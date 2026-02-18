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

// ============================================================================
// MEMORY SOURCE
// ============================================================================

/**
 * Raw upload (voice file or image)
 * Immutable after creation
 */
export interface MemorySource {
  id: string; // UUID
  createdAt: Date;
  modality: Modality;
  storagePath: string; // Path or URL to raw file
  metadata: Record<string, any>; // EXIF, duration, format, etc.
  processingStatus: ProcessingStatus;
  errorMessage?: string;
}

/**
 * Input for creating a new memory source
 */
export interface CreateMemorySourceInput {
  modality: Modality;
  storagePath: string;
  metadata?: Record<string, any>;
  userId?: string;
}

// ============================================================================
// MEMORY
// ============================================================================

/**
 * Derived content from memory source (1:1)
 * Contains processed text and location
 */
export interface Memory {
  id: string; // UUID
  memorySourceId: string; // UUID FK
  userId?: string; // Set when auth enabled
  createdAt: Date;
  recordedAt: Date; // When the moment was captured
  modality: Modality;
  rawText: string; // Original transcript/caption
  normalizedText: string; // Cleaned text for embedding
  aiSummary?: string; // Optional short summary for UI
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

/**
 * Input for creating a new memory
 */
export interface CreateMemoryInput {
  memorySourceId: string;
  userId?: string;
  recordedAt: Date;
  modality: Modality;
  rawText: string;
  normalizedText: string;
  aiSummary?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
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
  userQuery: string;
  memoryIds: string[];
  searchMetadata?: SearchMetadata;
}

// ============================================================================
// DATABASE RESULT TYPES
// ============================================================================

/**
 * Raw database row from memory_sources table
 */
export interface MemorySourceRow {
  id: string;
  created_at: Date;
  modality: string;
  storage_path: string;
  metadata: any;
  processing_status: string;
  error_message: string | null;
}

/**
 * Raw database row from memories table
 */
export interface MemoryRow {
  id: string;
  memory_source_id: string;
  user_id: string | null;
  created_at: Date;
  recorded_at: Date;
  modality: string;
  raw_text: string;
  normalized_text: string;
  ai_summary: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
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
 * Convert database row to MemorySource domain object
 */
export const mapMemorySourceRow = (row: MemorySourceRow): MemorySource => ({
  id: row.id,
  createdAt: row.created_at,
  modality: row.modality as Modality,
  storagePath: row.storage_path,
  metadata: row.metadata || {},
  processingStatus: row.processing_status as ProcessingStatus,
  errorMessage: row.error_message || undefined,
});

/**
 * Convert database row to Memory domain object
 */
export const mapMemoryRow = (row: MemoryRow): Memory => ({
  id: row.id,
  memorySourceId: row.memory_source_id,
  userId: row.user_id || undefined,
  createdAt: row.created_at,
  recordedAt: row.recorded_at,
  modality: row.modality as Modality,
  rawText: row.raw_text,
  normalizedText: row.normalized_text,
  aiSummary: row.ai_summary || undefined,
  latitude: row.latitude || undefined,
  longitude: row.longitude || undefined,
  locationName: row.location_name || undefined,
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
  userId?: string;
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
  userId?: string;
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
  user_id: string | null;
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
  userId: row.user_id || undefined,
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
