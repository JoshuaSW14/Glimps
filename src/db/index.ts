/**
 * Database connection module
 * Phase 2: Connection pool and transaction support
 */

import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

// Singleton pool instance
let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
    });
    
    logger.info('Database connection pool created');
  }
  
  return pool;
}

/**
 * Execute a function within a database transaction
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', error);
    throw new DatabaseError(
      'Transaction failed',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    client.release();
  }
}

/**
 * Close database connection pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

// Export types
export type { Pool, PoolClient } from 'pg';
