/**
 * Jest global setup: set required env vars before any module is imported.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://glimps:test@localhost:5432/glimps_test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
process.env.APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.glimps.test';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.NODE_ENV = 'test';
process.env.STORAGE_PATH = '/tmp/glimps-test-storage';
