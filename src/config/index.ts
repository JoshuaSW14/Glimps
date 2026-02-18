/**
 * Centralized Configuration
 * Phase 2: Application configuration with validation
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  // Server
  port: number;
  nodeEnv: string;
  
  // Database
  databaseUrl: string;
  
  // OpenAI
  openaiApiKey: string;
  
  // Storage
  storagePath: string;
  maxFileSize: number; // bytes
  
  // Processing
  maxRetries: number;
  retryBackoffMs: number;
  
  // Authentication (Phase 2)
  jwtSecret: string;
  jwtExpiresIn: string;
  
  // CORS
  allowedOrigins: string[];
  
  // Upload limits
  uploadSizeLimit: string;
  signedUrlExpiry: number;
}

function validateEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: validateEnv('DATABASE_URL'),
  
  // OpenAI
  openaiApiKey: validateEnv('OPENAI_API_KEY'),
  
  // Storage
  storagePath: process.env.STORAGE_PATH || './storage/uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default
  
  // Processing
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryBackoffMs: parseInt(process.env.RETRY_BACKOFF_MS || '1000', 10),
  
  // Authentication
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081').split(',').map(s => s.trim()).filter(Boolean),
  
  // Upload limits
  uploadSizeLimit: process.env.UPLOAD_SIZE_LIMIT || '50MB',
  signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10),
};

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
