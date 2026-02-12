import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { getMigrationFiles, runMigrations } from './migrate';

// Mock @neondatabase/serverless
const mockSqlFn = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => mockSqlFn),
  neonConfig: {},
}));

describe('migrate', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    mockSqlFn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
  });

  describe('getMigrationFiles', () => {
    it('returns empty array when migrations directory has no SQL files', () => {
      // Old Neon migrations were removed — Supabase migrations live in supabase/migrations/
      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const files = getMigrationFiles(migrationsDir);

      expect(files).toEqual([]);
    });

    it('returns empty array for non-existent directory', () => {
      const files = getMigrationFiles('/nonexistent/path');
      expect(files).toEqual([]);
    });

    it('filters only .sql files', () => {
      // Uses supabase/migrations which has real SQL files
      const migrationsDir = join(import.meta.dirname, '../../supabase/migrations');
      const files = getMigrationFiles(migrationsDir);

      expect(files.length).toBeGreaterThanOrEqual(1);
      for (const file of files) {
        expect(file).toMatch(/\.sql$/);
      }
    });
  });

  describe('runMigrations', () => {
    it('returns error when database is not configured', async () => {
      const result = await runMigrations('/some/path');

      expect(result.error).toBe(
        'Database not configured - missing DATABASE_URL environment variable'
      );
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('reports no migrations when directory is empty', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      mockSqlFn
        .mockResolvedValueOnce([]) // CREATE TABLE migrations
        .mockResolvedValueOnce([]) // SELECT applied migrations
        .mockResolvedValue([]);

      // Old Neon migrations removed — directory is empty
      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const result = await runMigrations(migrationsDir);

      expect(result.error).toBeUndefined();
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('handles database errors gracefully', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      mockSqlFn.mockRejectedValueOnce(new Error('Connection refused'));

      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const result = await runMigrations(migrationsDir);

      expect(result.error).toBe('Connection refused');
      expect(result.applied).toEqual([]);
    });
  });
});
