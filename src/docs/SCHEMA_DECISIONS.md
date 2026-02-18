# Schema Design Decisions

## Overview

This document explains the rationale behind Glimps' database schema design, key architectural choices, and considerations for future scalability.

## Core Principles

### 1. Raw-First Immutability

**Decision**: Separate `memory_sources` table for raw uploads, distinct from `memories` table for processed content.

**Rationale**:
- Raw data (audio files, images) is **never modified** after creation
- Enables reprocessing if AI models improve or bugs are fixed
- Clear audit trail: raw input → processing → derived output
- Supports failure recovery: if processing fails, raw source remains intact

**Alternative Considered**: Single table with both raw and processed data
- **Rejected**: Violates single responsibility principle; makes reprocessing more complex

### 2. Separation of Embeddings

**Decision**: `memory_embeddings` as a separate table with 1:1 relationship to `memories`.

**Rationale**:
- Embeddings can be regenerated without touching memory content
- Supports embedding model upgrades (e.g., switching from text-embedding-3-large to future models)
- `model_version` column tracks which embeddings use which model
- Keeps `memories` table focused on semantic content, not vector math
- Enables multiple embeddings per memory in future (e.g., multilingual support)

**Alternative Considered**: Embedding column directly in `memories` table
- **Rejected**: 3072-float vectors bloat the memories table; regeneration requires updating core memory rows

### 3. Explicit Processing Status

**Decision**: `processing_status` enum with states: pending, processing, completed, failed.

**Rationale**:
- Supports idempotent processing: avoid re-processing completed memories
- Enables retry logic for failed uploads
- Clear visibility into processing pipeline health
- Supports distributed processing: workers can claim 'pending' tasks

**States**:
- `pending`: uploaded but not yet processed
- `processing`: actively being transcribed/embedded
- `completed`: ready for retrieval
- `failed`: processing error occurred (see `error_message`)

---

## Table-by-Table Rationale

### `memory_sources`

#### `storage_path` (TEXT) vs. BYTEA blob

**Decision**: Store path/URL, not raw file bytes.

**Rationale**:
- Database should not be a file system
- Enables flexible storage backends (S3, local disk, CDN)
- Keeps database size manageable (pointers vs. blobs)
- Simplifies backup strategies (DB and files can be backed up separately)

**Trade-off**: Additional dependency on external storage; must ensure consistency.

#### `metadata` (JSONB)

**Decision**: Flexible JSONB column instead of fixed columns.

**Rationale**:
- Voice files need: duration, format, sample_rate
- Images need: width, height, EXIF, camera model
- Avoids NULL-heavy columns for modality-specific data
- Supports future modalities (video, text documents) without schema migration

**Example**:
```json
{
  "duration_seconds": 42,
  "format": "m4a",
  "sample_rate": 44100,
  "exif": { "latitude": 37.7749, "longitude": -122.4194 }
}
```

---

### `memories`

#### `raw_text` vs. `normalized_text`

**Decision**: Store both original and normalized text.

**Rationale**:
- `raw_text`: Original transcript/caption for audit and display
- `normalized_text`: Cleaned text for embedding generation
- Enables re-normalization if prompt improves (without re-transcribing)
- Preserves original for user reference ("What did I actually say?")

**Example**:
- `raw_text`: "Um, so, like, I met Sarah for coffee today, you know?"
- `normalized_text`: "I met Sarah for coffee today."

#### `recorded_at` vs. `created_at`

**Decision**: Separate timestamps for capture time vs. creation time.

**Rationale**:
- User may upload old memories ("I recorded this yesterday")
- `recorded_at`: User-facing timestamp (when the moment happened)
- `created_at`: System timestamp (when the memory was stored)
- Critical for accurate time-based retrieval ("What did I do last Tuesday?")

#### Location fields: `latitude`, `longitude`, `location_name`

**Decision**: Three nullable columns instead of PostGIS geography.

**Rationale**:
- Simple: No additional extension required (pgvector already adds one)
- Sufficient for radius searches: `WHERE sqrt((lat - ?)^2 + (lon - ?)^2) < radius`
- `location_name`: Human-readable place ("Golden Gate Park") for display
- All nullable: Not every memory has location

**Future Enhancement**: If geo queries become performance-critical, add PostGIS and GiST indexes.

---

### `memory_embeddings`

#### `embedding vector(3072)`

**Decision**: 3072 dimensions for text-embedding-3-large.

**Rationale**:
- OpenAI's text-embedding-3-large defaults to 3072 dimensions
- Full dimensionality maximizes semantic fidelity
- Can be reduced (256-1536) via API `dimensions` param if cost/performance requires it

**Index Choice**: HNSW (Hierarchical Navigable Small Worlds)

```sql
CREATE INDEX idx_memory_embeddings_hnsw ON memory_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

**Rationale**:
- HNSW: Fast approximate nearest neighbor search (ANN)
- `m=16`: Graph connectivity (higher = more accurate, slower builds)
- `ef_construction=64`: Build-time search depth (higher = better recall)
- `vector_cosine_ops`: Cosine distance (best for normalized embeddings)

**Alternative**: IVFFlat (Inverted File Index)
- **Rejected**: HNSW generally outperforms IVFFlat for recall and query speed in most workloads

#### `model_version` (TEXT)

**Decision**: Track embedding model explicitly.

**Rationale**:
- Enables gradual migration: new memories use new model, old embeddings remain
- Debug tool: "Why is this memory not showing up?" → Check model version
- Future-proof: OpenAI will release better models (text-embedding-4-*, etc.)

**Migration Strategy**: When upgrading models, regenerate embeddings in batches, compare retrieval quality before full cutover.

---

### `retrieval_logs`

#### Why NOT store `query_embedding`?

**Decision**: Store `user_query` (text) but not its embedding (3072 floats).

**Rationale**:
- **Storage cost**: 3072 floats × 4 bytes = 12 KB per log entry
- **Use case**: Query embeddings are ephemeral; can be regenerated if needed for debugging
- **Trade-off**: If debugging requires exact embedding, re-embed (non-deterministic, but close enough)

**Alternative**: Store compressed embedding (e.g., PCA to 256 dims)
- **Deferred**: Premature optimization; revisit if retrieval debugging becomes critical

#### `memory_ids` (UUID[])

**Decision**: Array of UUIDs, preserving ranking order.

**Rationale**:
- **Explainability**: "Your answer is based on memories [A, B, C]" (Phase 4)
- **Ranking**: First element = highest score
- **Reproducibility**: Can recreate retrieval results for debugging

**Example**:
```sql
memory_ids: ['550e8400-e29b-41d4-a716-446655440000', '...', '...']
search_metadata: { "scores": [0.92, 0.87, 0.81], "k": 5, "latency_ms": 23 }
```

#### `search_metadata` (JSONB)

**Decision**: Flexible JSONB for filters, scores, and future analytics.

**Rationale**:
- **Scores**: Similarity scores for each returned memory
- **Filters**: Time/location constraints applied
- **Performance**: Query latency, number of candidates, etc.
- **Future**: A/B testing, relevance tuning, analytics

---

## Indexing Strategy

### Objectives

1. **Fast vector similarity search** (primary use case)
2. **Efficient time-based filtering** ("memories from last week")
3. **Location-based queries** ("memories near San Francisco")
4. **Audit log queries** (recent searches, debug logs)

### Critical Indexes

| Index | Purpose | Cost |
|-------|---------|------|
| `idx_memory_embeddings_hnsw` | Vector similarity (cosine) | High build, low query |
| `idx_memories_recorded_at` | Time-range filters (DESC for recent) | Low |
| `idx_memories_location` | Lat/lon filters (partial, only when NOT NULL) | Low |
| `idx_memory_sources_status` | Processing queue (pending → processing) | Low |

### Why HNSW, not IVFFlat?

**HNSW Advantages**:
- No training required (IVFFlat needs ANALYZE/training)
- Better recall at high speed
- Works well for dynamic datasets (inserts don't degrade performance)

**Trade-off**: HNSW uses more memory (graph structure). For 1M memories × 3072 dims:
- Vectors: ~12 GB
- HNSW index: ~2-4 GB additional

**Mitigation**: Sufficient for single-user app; multi-user scaling addressed below.

---

## Scalability Considerations

### Multi-User Support (Phase 2+)

**Current Schema**: Single-user assumption (no `user_id` column).

**Migration Path**:
1. Add `user_id` to `memory_sources`, `memories`, `retrieval_logs`
2. Add `idx_memories_user_id` (or composite: `user_id, recorded_at`)
3. Row-level security (RLS) policies in PostgreSQL for isolation

**Partitioning Strategy**: Partition `memories` and `memory_embeddings` by `user_id` for large deployments.

---

### Embedding Model Migration

**Scenario**: OpenAI releases text-embedding-4-large (4096 dims, better performance).

**Migration Steps**:
1. Update `memory_embeddings` table: `ALTER TABLE ... ADD COLUMN embedding_v2 vector(4096)`
2. Background job: Re-embed all `normalized_text`, populate `embedding_v2`
3. Update retrieval logic to use `embedding_v2` when available
4. Once complete, drop old `embedding` column

**Alternative (cleaner)**: Add `model_version` enum, keep single `embedding` column with flexible dims (PostgreSQL allows mixed-dimension vectors in same column if index is rebuilt).

---

### Large Memory Count (1M+ memories)

**Challenges**:
- Vector index size
- Query latency at scale
- Storage costs

**Mitigations**:
1. **HNSW scales to millions**: 1M memories × 3072 dims = ~12 GB vectors + ~4 GB index (manageable)
2. **Dimensionality reduction**: Use 1536 or 768 dims instead of 3072 (trade-off: slight accuracy loss)
3. **Partitioning**: Partition `memory_embeddings` by user or time range
4. **Archival**: Move old memories to cold storage if retrieval frequency drops

**Benchmark Target**: <100ms for top-10 retrieval on 1M memories (achievable with HNSW).

---

### Retrieval Log Growth

**Problem**: `retrieval_logs` grows unbounded (every query logged).

**Mitigations**:
1. **Time-based partitioning**: Partition by month, archive old partitions
2. **Retention policy**: Delete logs older than 90 days (configurable)
3. **Sampling**: Log only 10% of queries for analytics (if volume is high)

**Storage Estimate**: 1000 queries/day × 1 KB/log = 365 MB/year (negligible).

---

## Security Considerations (Future)

While Phase 1 does not implement authentication, the schema prepares for it:

### Data Isolation

- Add `user_id` FK to all tables
- PostgreSQL Row-Level Security (RLS) policies:
  ```sql
  CREATE POLICY user_isolation ON memories
      USING (user_id = current_setting('app.user_id')::uuid);
  ```

### Sensitive Data

- `raw_text` may contain private information (no encryption in Phase 1)
- Future: Encrypt `raw_text` and `storage_path` at rest (AWS KMS, PostgreSQL pgcrypto)

### Retrieval Logs

- `retrieval_logs` reveals user search behavior (sensitive)
- Future: Encrypt `user_query` or implement log retention policies

---

## Schema Evolution

### Adding New Modalities (e.g., Video)

1. Extend `modality_enum`: `ALTER TYPE modality_enum ADD VALUE 'video';`
2. Update `metadata` JSONB for video-specific fields (duration, resolution, fps)
3. No schema migration required (JSONB flexibility)

### Adding New Fields to `memories`

Example: User wants to add custom tags.

**Option 1**: Add `tags TEXT[]` column (simple, queryable)
**Option 2**: Add `custom_metadata JSONB` (flexible, harder to query)

**Recommendation**: Use JSONB for exploratory features, migrate to columns if heavily queried.

---

## Event Domain Model (Phase 1)

### Why Events as a Separate Concept

**Decision**: Events are first-class entities with their own table, distinct from memories.

**Rationale**:
- **Humans recall situations, not atomic captures**: A "coffee with Sam" is one experience spanning multiple photos and voice notes
- **Events are the unit of experience; memories are evidence**: This mirrors how human memory works—we remember the afternoon, not each individual snapshot
- **Preserves memory immutability**: Events can be created, updated, and deleted without touching memory rows
- **Enables sophisticated retrieval**: Query events first, then pull supporting memories (Phase 3)
- **Future-proof**: Allows features like event merging, splitting, and manual editing without memory data migration

**Alternative Considered**: Tags or categories on memories
- **Rejected**: Tags are user-applied labels; events are system-inferred situations. An event has temporal bounds, location, and AI-generated summary—far richer than a tag.

### `memory_event_links` with `relationship_type`

**Decision**: Many-to-many link table with `relationship_type` enum.

**Rationale**:
- **Memories can support multiple events**: A photo from "Week in Toronto" is also part of "Coffee with Sam on Tuesday"
- **Events contain multiple memories**: "Afternoon at the park" includes 5 photos and 2 voice notes
- **Relationship type enables ranking**:
  - `primary`: The best single representation (e.g., the voice note that names the event)
  - `supporting`: Clearly part of the same situation
  - `context`: Same time/place but less central

**Benefits**:
- UI can show primary memory first, supporting memories second
- Event summaries can weight primary memories more heavily
- Future: relationship_type can become a confidence score (0-1) instead of enum

**Alternative Considered**: Memories → single event (1:N FK on memories table)
- **Rejected**: Real life is ambiguous—a photo can be part of multiple events. FK would force artificial boundaries.

### Separate `event_embeddings` Table

**Decision**: `event_embeddings` as separate 1:1 table, mirroring `memory_embeddings`.

**Rationale**:
- **Different semantics**: Memory embeddings encode raw content (transcript/caption). Event embeddings encode *situation* (title + summary)—a synthesis of multiple memories
- **Regeneration without side effects**: When event title/summary updates (Phase 2), only `event_embeddings` is rewritten. Memories and memory_embeddings unchanged
- **Consistency**: Same separation pattern as `memory_embeddings` (see above). Developers know embedding regeneration is safe
- **Indexing**: Event search (Phase 3) uses `event_embeddings` HNSW index. Keeping vectors separate keeps events table small and queryable

**Trade-off**: 1:1 overhead. Accepted because events are higher-level (fewer than memories) and embedding regeneration is common.

### Event Timestamps and Bounds

**Decision**: `start_time` and `end_time` instead of single timestamp.

**Rationale**:
- **Events span time**: "Morning at the café" lasted 2 hours. Single timestamp would lose this information
- **Enables temporal queries**: "What did I do last Friday afternoon?" → search events where `start_time` or `end_time` overlaps the timeframe
- **Formation logic (Phase 2)**: Event bounds expand/contract as memories are added/removed

**Implementation**:
- `start_time = MIN(memory.recorded_at)` for all linked memories
- `end_time = MAX(memory.recorded_at)` for all linked memories
- `CHECK (end_time >= start_time)` constraint

### `confidence_score` (0-1)

**Decision**: Events have a confidence score indicating coherence.

**Rationale**:
- **Not all groupings are clear events**: 5 photos in 10 minutes at the same place = high confidence. 3 photos 2 hours apart in different locations = low confidence
- **UI filtering**: Show only high-confidence events to users by default
- **Formation quality metric** (Phase 2): LLM can output confidence. Low-confidence events can be re-evaluated or auto-merged later

**Scale**: 0 = unrelated memories, 1 = definitely a single coherent event.

**Future**: Could become multi-dimensional (temporal_confidence, spatial_confidence, semantic_confidence).

---

## Summary

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Separate `memory_sources` | Immutability, reprocessing | Additional table join |
| Separate `memory_embeddings` | Regeneration, model upgrades | 1:1 overhead |
| `vector(3072)` | Full text-embedding-3-large fidelity | Storage cost (can reduce) |
| HNSW index | Fast ANN, no training needed | Memory overhead |
| JSONB `metadata` | Flexibility for modality-specific data | Less type safety |
| No `query_embedding` in logs | Storage efficiency | Debugging harder |

---

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
