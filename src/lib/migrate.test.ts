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
    it('returns sorted SQL files from migrations directory', () => {
      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const files = getMigrationFiles(migrationsDir);

      expect(files).toContain('001_create_alerts_table.sql');
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('returns sorted files', () => {
      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const files = getMigrationFiles(migrationsDir);

      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it('returns empty array for non-existent directory', () => {
      const files = getMigrationFiles('/nonexistent/path');
      expect(files).toEqual([]);
    });

    it('filters only .sql files', () => {
      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const files = getMigrationFiles(migrationsDir);

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

    it('applies pending migrations when database is configured', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      // First call: CREATE TABLE migrations
      // Second call: SELECT applied migrations (returns empty)
      // Then calls for each SQL statement in the migration
      // Then INSERT into migrations table
      mockSqlFn
        .mockResolvedValueOnce([]) // CREATE TABLE migrations
        .mockResolvedValueOnce([]) // SELECT applied migrations
        .mockResolvedValue([]); // All subsequent calls

      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const result = await runMigrations(migrationsDir);

      expect(result.error).toBeUndefined();
      expect(result.applied).toContain('001_create_alerts_table');
      expect(result.skipped).toEqual([]);
    });

    it('skips already-applied migrations', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';

      mockSqlFn
        .mockResolvedValueOnce([]) // CREATE TABLE migrations
        .mockResolvedValueOnce([{ name: '001_create_alerts_table' }]) // SELECT applied
        .mockResolvedValue([]);

      const migrationsDir = join(import.meta.dirname, '../../migrations');
      const result = await runMigrations(migrationsDir);

      expect(result.error).toBeUndefined();
      expect(result.applied).toEqual([]);
      expect(result.skipped).toContain('001_create_alerts_table');
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
