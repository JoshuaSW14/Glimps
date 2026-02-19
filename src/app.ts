/**
 * Express Application
 * Exported separately from index.ts so tests can import the app without starting the server.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiRoutes } from './routes';

export const app = express();

app.use(
  cors({
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info('Request received', { method: req.method, path: req.path });
  next();
});

app.use('/api', apiRoutes);

app.get('/', (_req, res) => {
  res.json({ name: 'Glimps API', version: '0.2.0', status: 'running' });
});

app.use(errorHandler);
