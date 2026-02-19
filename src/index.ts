/**
 * Glimps Backend Entry Point
 */

import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { storageService } from './services/storage/storageService';
import { getPool, closePool } from './db';

async function start(): Promise<void> {
  try {
    await storageService.initialize();

    const pool = getPool();
    await pool.query('SELECT NOW()');
    logger.info('Database connection verified');

    app.listen(config.port, () => {
      logger.info('Server started', { port: config.port, nodeEnv: config.nodeEnv });
      console.log(`\n✅ Glimps Backend running on http://localhost:${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing gracefully');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing gracefully');
  await closePool();
  process.exit(0);
});

start();
