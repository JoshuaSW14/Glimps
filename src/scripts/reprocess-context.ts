/**
 * One-off: run context inference for all existing memories (after migration 005).
 * Usage: npm run build && node -r dotenv/config dist/scripts/reprocess-context.js
 * Or: npx tsx -r dotenv/config src/scripts/reprocess-context.ts
 */

import { getPool, closePool } from '../db';
import { memoryRepository } from '../db/repositories';
import { contextInferenceService } from '../services/context/contextInferenceService';

async function main() {
  getPool();
  const limit = 5000;
  const memories = await memoryRepository.listRecent(limit);
  console.log(`Running context inference for ${memories.length} memories...`);
  let done = 0;
  let err = 0;
  for (const m of memories) {
    try {
      await contextInferenceService.inferAndStoreContext(m.id, m.userId ?? undefined);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${memories.length}`);
    } catch (e) {
      err++;
      console.warn(`  Skip memory ${m.id}:`, (e as Error).message);
    }
  }
  console.log(`Done. Processed: ${done}, errors: ${err}`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
