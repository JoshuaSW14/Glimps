-- Glimps Database Schema
-- Phase 1: Domain Modeling
-- PostgreSQL 13+ with pgvector extension required

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Modality of the memory (voice or image)
CREATE TYPE modality_enum AS ENUM ('voice', 'image');

-- Processing status for memory sources
CREATE TYPE processing_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================================
-- TABLES
-- ============================================================================

-- 1. MEMORY_SOURCES
-- Stores raw uploads (voice files or images) and their processing state
-- IMMUTABLE: content is never modified after creation
CREATE TABLE memory_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modality modality_enum NOT NULL,
    storage_path TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_status processing_status_enum NOT NULL DEFAULT 'pending',
    error_message TEXT
);

-- 2. MEMORIES
-- Derived content from memory_sources (1:1 relationship)
-- Contains processed text and location for retrieval
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_source_id UUID NOT NULL REFERENCES memory_sources(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_at TIMESTAMPTZ NOT NULL,
    modality modality_enum NOT NULL,
    raw_text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    ai_summary TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_name TEXT,
    CONSTRAINT unique_memory_per_source UNIQUE (memory_source_id)
);

-- 3. MEMORY_EMBEDDINGS
-- Vector storage for semantic search (1:1 with memories)
-- Separate table allows embedding regeneration without touching memories
-- Note: Using 2000 dimensions (Neon HNSW limit) instead of 3072
CREATE TABLE memory_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    embedding vector(2000) NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_embedding_per_memory UNIQUE (memory_id)
);

-- 4. RETRIEVAL_LOGS
-- Audit trail for every search (explainability and debugging)
CREATE TABLE retrieval_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_query TEXT NOT NULL,
    memory_ids UUID[] NOT NULL,
    search_metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Memory sources indexes
CREATE INDEX idx_memory_sources_status ON memory_sources(processing_status);
CREATE INDEX idx_memory_sources_created_at ON memory_sources(created_at DESC);

-- Memories indexes
CREATE INDEX idx_memories_memory_source_id ON memories(memory_source_id);
CREATE INDEX idx_memories_recorded_at ON memories(recorded_at DESC);
CREATE INDEX idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX idx_memories_location ON memories(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Memory embeddings indexes
-- HNSW index for fast approximate nearest neighbor search using cosine distance
-- m=16 and ef_construction=64 are good defaults for most use cases
CREATE INDEX idx_memory_embeddings_hnsw ON memory_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);

-- Retrieval logs indexes
CREATE INDEX idx_retrieval_logs_created_at ON retrieval_logs(created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE memory_sources IS 'Stores raw uploads (voice files or images). Immutable after creation.';
COMMENT ON TABLE memories IS 'Derived content from memory_sources (1:1). Contains processed text and location.';
COMMENT ON TABLE memory_embeddings IS 'Vector storage for semantic search (1:1 with memories). Can be regenerated.';
COMMENT ON TABLE retrieval_logs IS 'Audit trail for every search query.';

COMMENT ON COLUMN memory_sources.storage_path IS 'Path or URL to raw file (S3, local storage, etc.)';
COMMENT ON COLUMN memory_sources.metadata IS 'Flexible JSON for EXIF, duration, format, etc.';
COMMENT ON COLUMN memories.raw_text IS 'Original transcript/caption before normalization';
COMMENT ON COLUMN memories.normalized_text IS 'Cleaned text used for embedding generation';
COMMENT ON COLUMN memories.recorded_at IS 'When the moment was captured (user-facing timestamp)';
COMMENT ON COLUMN memory_embeddings.embedding IS 'text-embedding-3-large vector (2000 dimensions - Neon HNSW limit)';
COMMENT ON COLUMN retrieval_logs.memory_ids IS 'Memories returned (ordered by rank)';
COMMENT ON COLUMN retrieval_logs.search_metadata IS 'Scores, filters, K value, latency, etc.';

-- ============================================================================
-- EVENT DOMAIN MODEL (Phase 1)
-- ============================================================================

-- Relationship type enum for memory-event links
CREATE TYPE relationship_type_enum AS ENUM ('primary', 'supporting', 'context');

-- 5. EVENTS
-- Represents a real-world situation composed of multiple memories
-- Events are the unit of experience; memories are evidence
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    location_name TEXT,
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    confidence_score DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (end_time >= start_time),
    CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

-- 6. MEMORY_EVENT_LINKS
-- Many-to-many relationship between memories and events
-- Allows memories to support multiple events and events to contain multiple memories
CREATE TABLE memory_event_links (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    relationship_type relationship_type_enum NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (memory_id, event_id)
);

-- 7. EVENT_EMBEDDINGS
-- Vector storage for event-level semantic search (1:1 with events)
-- Separate from memory embeddings: encodes situation (title+summary) not raw content
CREATE TABLE event_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    embedding vector(2000) NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_embedding_per_event UNIQUE (event_id)
);

-- ============================================================================
-- EVENT INDEXES
-- ============================================================================

-- Events indexes
CREATE INDEX idx_events_start_time ON events(start_time DESC);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_location ON events(location_lat, location_lng) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- Memory event links indexes
CREATE INDEX idx_memory_event_links_event_id ON memory_event_links(event_id);
CREATE INDEX idx_memory_event_links_memory_id ON memory_event_links(memory_id);
CREATE INDEX idx_memory_event_links_type ON memory_event_links(relationship_type);

-- Event embeddings indexes
CREATE INDEX idx_event_embeddings_event_id ON event_embeddings(event_id);
-- HNSW index for fast approximate nearest neighbor search using cosine distance
CREATE INDEX idx_event_embeddings_hnsw ON event_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- EVENT COMMENTS
-- ============================================================================

COMMENT ON TABLE events IS 'Real-world situations composed of multiple memories. Events are the unit of experience.';
COMMENT ON TABLE memory_event_links IS 'Many-to-many links between memories and events with relationship type.';
COMMENT ON TABLE event_embeddings IS 'Vector storage for event-level semantic search (1:1 with events). Encodes situation, not raw content.';

COMMENT ON COLUMN events.start_time IS 'Earliest memory timestamp in this event';
COMMENT ON COLUMN events.end_time IS 'Latest memory timestamp in this event';
COMMENT ON COLUMN events.title IS 'Short, human-readable event name';
COMMENT ON COLUMN events.summary IS 'One-paragraph synthesis of the event';
COMMENT ON COLUMN events.confidence_score IS 'Confidence that these memories form a coherent event (0-1)';
COMMENT ON COLUMN memory_event_links.relationship_type IS 'primary: best representation | supporting: clear part | context: tangentially related';
COMMENT ON COLUMN event_embeddings.embedding IS 'text-embedding-3-large vector (2000 dimensions) of event title+summary';
