-- ============================================================================
-- USER-DEFINED LABELS (tags for people, pets, events, etc.)
-- Run: npm run db:migrate:only (or paste in Supabase SQL Editor)
-- ============================================================================

-- Label kinds: person, pet, event, place, note
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_label_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_labels_user_id ON labels(user_id);

-- Many-to-many: memories <-> labels
CREATE TABLE IF NOT EXISTS memory_labels (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (memory_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_labels_memory_id ON memory_labels(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_labels_label_id ON memory_labels(label_id);

COMMENT ON TABLE labels IS 'User-defined tags (people, pets, events, etc.) for personalizing AI answers.';
COMMENT ON TABLE memory_labels IS 'Links memories to labels.';
COMMENT ON COLUMN labels.kind IS 'person, pet, event, place, note';
