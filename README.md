# Glimps Backend

Node.js + Express + TypeScript backend for Glimps personal memory search engine.

## Current Status

**Phase 1: Domain Modeling** ✅ Complete
**Phase 2: Memory Ingestion Pipeline** ✅ Complete

The backend now supports:
- File uploads (voice/image)
- Automatic transcription/captioning
- Text normalization
- Embedding generation
- Database storage with transactions
- Status tracking and retry logic

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# Run database migration
npm run db:migrate

# Start development server
npm run dev
```

Server will start on `http://localhost:3000`

## API Endpoints

### Memory Operations

```bash
# Upload voice memory
POST /api/memories/upload
Content-Type: multipart/form-data
Body: file, modality (voice|image), recordedAt, latitude, longitude, locationName

# List recent memories
GET /api/memories?limit=20

# Get specific memory
GET /api/memories/:id

# Check processing status
GET /api/memories/sources/:sourceId

# Retry failed processing
POST /api/memories/sources/:sourceId/retry

# Health check
GET /api/health
```

## Directory Structure

```
backend/src/
├── config/                      # Configuration
├── db/
│   ├── index.ts                 # Connection pool + transactions
│   ├── repositories/            # Data access layer
│   ├── schema.sql               # Database schema
│   └── types/                   # Domain types
├── services/
│   ├── storage/                 # File storage
│   ├── ai/                      # OpenAI integrations
│   └── pipeline/                # Processing orchestration
├── controllers/                 # HTTP request handlers
├── routes/                      # Express routes
├── middleware/                  # Validation, error handling
├── utils/                       # Logging, errors, retry
└── index.ts                     # Server entry point
```

## Environment Variables

Required:

```bash
DATABASE_URL=postgresql://...    # Neon or local PostgreSQL
OPENAI_API_KEY=sk-proj-...       # OpenAI API key
```

Optional:

```bash
PORT=3000                        # Server port
NODE_ENV=development             # Environment
STORAGE_PATH=./storage/uploads   # File storage location
MAX_FILE_SIZE=52428800           # 50MB default
MAX_RETRIES=3                    # AI service retries
RETRY_BACKOFF_MS=1000            # Initial retry delay
```

## Testing

See [PHASE2_TESTING.md](../PHASE2_TESTING.md) for comprehensive testing guide.

### Quick Test

```bash
# Health check
curl http://localhost:3000/api/health

# Upload a test memory
curl -X POST http://localhost:3000/api/memories/upload \
  -F "file=@test.m4a" \
  -F "modality=voice"
```

## Processing Pipeline

1. **Upload**: File received via multipart/form-data
2. **Store**: File saved to local storage
3. **Extract**: Whisper (voice) or GPT-4o-mini Vision (image)
4. **Normalize**: GPT-4o-mini removes filler words
5. **Embed**: text-embedding-3-large (2000 dimensions)
6. **Persist**: Memory + embedding stored in transaction
7. **Complete**: Status updated to 'completed'

**Average Time**: 3-8 seconds per upload

## Key Features

### Transaction Safety

Memory and embedding are stored atomically:

```typescript
await withTransaction(async (client) => {
  const memory = await memoryRepository.create(input, client);
  await memoryEmbeddingRepository.create(embedding, client);
  return memory;
});
```

### Retry Logic

AI services retry 3 times with exponential backoff:

```typescript
await withRetry(
  async () => await openai.embeddings.create(...),
  { maxRetries: 3, backoffMs: 1000 }
);
```

### Error Handling

Structured errors with HTTP status codes:

```typescript
throw new ValidationError('File is required');      // 400
throw new NotFoundError('Memory', id);              // 404
throw new AIServiceError('Whisper', 'API error');   // 502
```

### Structured Logging

JSON logs with context:

```typescript
logger.info('Memory processing started', {
  memorySourceId,
  modality,
  fileSize
});
```

## Dependencies

### Runtime

- `express` - Web framework
- `pg` - PostgreSQL client
- `dotenv` - Environment variables
- `openai` - OpenAI API client
- `multer` - File upload handling
- `uuid` - UUID generation

### Development

- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution
- `@types/*` - Type definitions

## Scripts

```bash
npm run dev          # Start development server with watch mode
npm run build        # Compile TypeScript to JavaScript
npm run start        # Run production build
npm run type-check   # Verify TypeScript types
npm run db:migrate   # Apply database schema
```

## Architecture Decisions

### Synchronous Processing

Memories are processed in the request cycle (not background jobs) because:
- Small uploads (< 60s voice, compressed images)
- 3-8s latency acceptable
- Simpler development and debugging
- No additional infrastructure needed

### 2000 Dimensions

Using 2000 dimensions (not 3072) because:
- Neon HNSW index limit
- Minimal quality loss (<2%)
- Faster queries

**Critical**: Must pass `dimensions: 2000` to OpenAI API

### Separate Repositories

Three repositories (source, memory, embedding) for:
- Clear separation of concerns
- Transaction support
- Easy testing
- Future extensibility

## Troubleshooting

### Server won't start

```bash
# Check database connection
node -r dotenv/config -e "const { Client } = require('pg'); \
  const client = new Client({ connectionString: process.env.DATABASE_URL }); \
  client.connect().then(() => console.log('✅ Connected'));"

# Check OpenAI API key
echo $OPENAI_API_KEY
```

### Upload fails

Check logs for detailed errors:

```bash
npm run dev
# Look for JSON logs with error details
```

### Storage directory missing

Server auto-creates on startup. Manually create if needed:

```bash
mkdir -p storage/uploads/voice storage/uploads/image
```

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Voice upload (30s) | 3-5s | Whisper + normalization + embedding |
| Image upload | 4-6s | Vision + normalization + embedding |
| List memories | <50ms | Database query |
| Get memory | <20ms | Database query |

## Next Phase

**Phase 3: Retrieval Engine**

Implement semantic search:
- Query embedding
- Vector similarity search
- Time/location filtering
- Ranked results

## References

- [OpenAI API Docs](https://platform.openai.com/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Express.js Guide](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
