import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDatabaseConfigured, resetConnection } from './db';

// Mock @neondatabase/serverless since we don't have a real database in tests
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn()),
  neonConfig: {},
}));

describe('db', () => {
  beforeEach(() => {
    // Clear environment variables and reset connection
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    resetConnection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    resetConnection();
  });

  describe('isDatabaseConfigured', () => {
    it('returns false when no database URL is set', () => {
      expect(isDatabaseConfigured()).toBe(false);
    });

    it('returns true when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      expect(isDatabaseConfigured()).toBe(true);
    });

    it('returns true when POSTGRES_URL is set', () => {
      process.env.POSTGRES_URL = 'postgres://localhost:5432/test';
      expect(isDatabaseConfigured()).toBe(true);
    });

    it('returns true when POSTGRES_URL_NON_POOLING is set', () => {
      process.env.POSTGRES_URL_NON_POOLING = 'postgres://localhost:5432/test';
      expect(isDatabaseConfigured()).toBe(true);
    });
  });
});
