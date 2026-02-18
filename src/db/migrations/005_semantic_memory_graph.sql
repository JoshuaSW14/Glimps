-- Migration 005: Semantic memory graph
-- Run this if you see "Failed to create memory" (e.g. column memory_source_id does not exist).
-- It drops the old memories/memory_sources structure and creates the new one.
-- Safe to run: only drops memories when the OLD schema is detected.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memories' AND column_name = 'memory_source_id'
  ) THEN
    DROP TABLE IF EXISTS memory_event_links CASCADE;
    DROP TABLE IF EXISTS memory_embeddings CASCADE;
    DROP TABLE IF EXISTS memory_tags CASCADE;
    DROP TABLE IF EXISTS memory_people CASCADE;
    DROP TABLE IF EXISTS memory_context CASCADE;
    DROP TABLE IF EXISTS memory_labels CASCADE;
    DROP TABLE IF EXISTS memories CASCADE;
    DROP TABLE IF EXISTS memory_sources CASCADE;
  END IF;
END $$;

-- Create enums if they don't exist (required for new memories table)
DO $$ BEGIN
  CREATE TYPE processing_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE memory_source_enum AS ENUM ('camera', 'upload', 'voice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE media_type_enum AS ENUM ('photo', 'audio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE tag_origin_enum AS ENUM ('ai', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New memories table (semantic graph)
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

-- memory_context (1:1)
CREATE TABLE IF NOT EXISTS memory_context (
    memory_id UUID PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
    user_note TEXT,
    location_name TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    confirmed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_memory_context_memory_id ON memory_context(memory_id);

-- memory_tags
CREATE TABLE IF NOT EXISTS memory_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    origin tag_origin_enum NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_tags_memory_id ON memory_tags(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag);

-- memory_people
CREATE TABLE IF NOT EXISTS memory_people (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    confirmed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_memory_people_memory_id ON memory_people(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_people_person_name ON memory_people(person_name);

-- memory_embeddings
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    embedding vector(2000) NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_embedding_per_memory UNIQUE (memory_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_hnsw ON memory_embeddings
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Recreate memory_labels if it was dropped (references memories)
CREATE TABLE IF NOT EXISTS memory_labels (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (memory_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_labels_memory_id ON memory_labels(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_labels_label_id ON memory_labels(label_id);

-- memory_event_links is recreated by schema.sql (depends on events table)
