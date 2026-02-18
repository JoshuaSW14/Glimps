-- Glimps Database Schema
-- Semantic memory graph: memories + context, tags, people, embeddings
-- PostgreSQL 13+ with pgvector extension required

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE processing_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE memory_source_enum AS ENUM ('camera', 'upload', 'voice');
CREATE TYPE media_type_enum AS ENUM ('photo', 'audio');
CREATE TYPE tag_origin_enum AS ENUM ('ai', 'user');

-- ============================================================================
-- USERS (for auth; memories and events reference user_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    apple_id TEXT UNIQUE,
    google_id TEXT UNIQUE,
    email TEXT,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT unique_provider CHECK (
        (apple_id IS NOT NULL AND google_id IS NULL) OR
        (google_id IS NOT NULL AND apple_id IS NULL) OR
        (apple_id IS NULL AND google_id IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- ============================================================================
-- MEMORIES (semantic memory graph)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    captured_at TIMESTAMPTZ NOT NULL,
    source memory_source_enum NOT NULL,
    media_type media_type_enum NOT NULL,
    storage_path TEXT NOT NULL,
    transcript TEXT,
    ai_summary TEXT,
    processing_status processing_status_enum NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_captured_at ON memories(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- ============================================================================
-- MEMORY_CONTEXT (1:1 with memory)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_context (
    memory_id UUID PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    user_note TEXT,
    location_name TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    confirmed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_memory_context_memory_id ON memory_context(memory_id);

-- ============================================================================
-- MEMORY_TAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    origin tag_origin_enum NOT NULL
);

CREATE INDEX idx_memory_tags_memory_id ON memory_tags(memory_id);
CREATE INDEX idx_memory_tags_tag ON memory_tags(tag);

-- ============================================================================
-- MEMORY_PEOPLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_people (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    confirmed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_memory_people_memory_id ON memory_people(memory_id);
CREATE INDEX idx_memory_people_person_name ON memory_people(person_name);

-- ============================================================================
-- MEMORY_EMBEDDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    embedding vector(2000) NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_embedding_per_memory UNIQUE (memory_id)
);

CREATE INDEX idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX idx_memory_embeddings_hnsw ON memory_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- RETRIEVAL_LOGS
-- ============================================================================

CREATE TABLE retrieval_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_query TEXT NOT NULL,
    memory_ids UUID[] NOT NULL,
    search_metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_retrieval_logs_created_at ON retrieval_logs(created_at DESC);

-- ============================================================================
-- EVENTS
-- ============================================================================

CREATE TYPE relationship_type_enum AS ENUM ('primary', 'supporting', 'context');

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_start_time ON events(start_time DESC);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_location ON events(location_lat, location_lng) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

CREATE TABLE memory_event_links (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    relationship_type relationship_type_enum NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (memory_id, event_id)
);

CREATE INDEX idx_memory_event_links_event_id ON memory_event_links(event_id);
CREATE INDEX idx_memory_event_links_memory_id ON memory_event_links(memory_id);

CREATE TABLE event_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    embedding vector(2000) NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_embedding_per_event UNIQUE (event_id)
);

CREATE INDEX idx_event_embeddings_event_id ON event_embeddings(event_id);
CREATE INDEX idx_event_embeddings_hnsw ON event_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- LABELS (user-defined tags; optional migration 004)
-- ============================================================================

CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_label_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_labels_user_id ON labels(user_id);

CREATE TABLE IF NOT EXISTS memory_labels (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (memory_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_labels_memory_id ON memory_labels(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_labels_label_id ON memory_labels(label_id);
