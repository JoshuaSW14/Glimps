/**
 * Glimps Backend Entry Point
 * Phase 2: Express server with memory ingestion pipeline
 */

import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiRoutes } from './routes';
import { storageService } from './services/storage/storageService';
import { getPool, closePool } from './db';

const app = express();

// CORS (Production: restrict to app origins)
app.use(
  cors({
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    query: req.query,
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Glimps API',
    version: '0.2.0',
    phase: 'Phase 2 - Memory Ingestion Pipeline',
    status: 'running',
    endpoints: {
      health: '/api/health',
      upload: 'POST /api/memories/upload',
      memories: 'GET /api/memories',
      memory: 'GET /api/memories/:id',
      sourceStatus: 'GET /api/memories/sources/:sourceId',
      retry: 'POST /api/memories/sources/:sourceId/retry',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Startup
async function start(): Promise<void> {
  try {
    // Initialize storage
    await storageService.initialize();
    
    // Test database connection
    const pool = getPool();
    await pool.query('SELECT NOW()');
    logger.info('Database connection verified');
    
    // Start server
    app.listen(config.port, () => {
      logger.info('Server started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
      });
      
      console.log('\n✅ Glimps Backend - Phase 2 (Memory Ingestion Pipeline)');
      console.log(`\n🚀 Server running on http://localhost:${config.port}`);
      console.log('\n📚 API Endpoints:');
      console.log(`   GET  http://localhost:${config.port}/`);
      console.log(`   GET  http://localhost:${config.port}/api/health`);
      console.log(`   POST http://localhost:${config.port}/api/memories/upload`);
      console.log(`   GET  http://localhost:${config.port}/api/memories`);
      console.log('\n💡 Ready to accept memory uploads!\n');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
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

// Start the server
start();
