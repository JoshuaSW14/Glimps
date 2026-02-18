-- ============================================================================
-- USERS & AUTH (App Store Production Hardening)
-- Run once on existing database: npm run db:migrate:only (or paste in Supabase SQL Editor)
-- ============================================================================

-- Users table (Apple Sign In / Google Sign In)
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

-- Add user_id to existing tables (nullable for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'memory_sources' AND column_name = 'user_id') THEN
        ALTER TABLE memory_sources ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX idx_memory_sources_user_id ON memory_sources(user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'memories' AND column_name = 'user_id') THEN
        ALTER TABLE memories ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX idx_memories_user_id ON memories(user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'user_id') THEN
        ALTER TABLE events ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        CREATE INDEX idx_events_user_id ON events(user_id);
    END IF;
END $$;

COMMENT ON TABLE users IS 'Users authenticated via Apple or Google Sign In. Backend never stores provider tokens.';
