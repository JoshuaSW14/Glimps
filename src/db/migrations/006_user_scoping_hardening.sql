-- Migration 006: User scoping hardening
-- Eliminates all NULL user_id rows and enforces NOT NULL constraints.
-- DESTRUCTIVE: orphan rows (user_id IS NULL) are deleted. No backwards compat.
-- Run this BEFORE deploying the backend code that enforces these constraints.

BEGIN;

-- 1. Wipe retrieval_logs entirely (no user_id column; data is unrecoverable to a user)
TRUNCATE retrieval_logs;

-- 2. Delete all cascade children of NULL-user memories before removing the memories
DELETE FROM memory_event_links
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL)
     OR event_id  IN (SELECT id FROM events   WHERE user_id IS NULL);

DELETE FROM memory_embeddings
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL);

DELETE FROM memory_tags
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL);

DELETE FROM memory_people
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL);

DELETE FROM memory_context
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL);

DELETE FROM memory_labels
  WHERE memory_id IN (SELECT id FROM memories WHERE user_id IS NULL);

DELETE FROM memories WHERE user_id IS NULL;

-- 3. Delete orphan events (user_id IS NULL)
DELETE FROM event_embeddings
  WHERE event_id IN (SELECT id FROM events WHERE user_id IS NULL);

DELETE FROM events WHERE user_id IS NULL;

-- 4. Enforce NOT NULL — will fail if any orphan rows remain (sanity check)
ALTER TABLE memories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE events   ALTER COLUMN user_id SET NOT NULL;

-- 5. Add user_id to retrieval_logs for per-user audit trail and account deletion
ALTER TABLE retrieval_logs
  ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_retrieval_logs_user_id ON retrieval_logs(user_id);

COMMIT;

-- DOWN (if needed):
-- BEGIN;
-- ALTER TABLE retrieval_logs DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE memories ALTER COLUMN user_id DROP NOT NULL;
-- ALTER TABLE events   ALTER COLUMN user_id DROP NOT NULL;
-- COMMIT;
