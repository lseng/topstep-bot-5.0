// Database migration runner for Neon Serverless Postgres

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { query, isDatabaseConfigured } from './db';
import { logger } from './logger';

/**
 * Result of a migration run
 */
export interface MigrationResult {
  applied: string[];
  skipped: string[];
  error?: string;
}

/**
 * Ensure the migrations tracking table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  await query`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/**
 * Get list of already-applied migrations from the database
 */
async function getAppliedMigrations(): Promise<string[]> {
  const rows = await query<{ name: string }>`
    SELECT name FROM migrations ORDER BY id ASC
  `;
  return rows.map((row) => row.name);
}

/**
 * Get list of migration files from the migrations directory
 */
export function getMigrationFiles(migrationsDir: string): string[] {
  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    return files;
  } catch {
    return [];
  }
}

/**
 * Run pending database migrations
 *
 * @param migrationsDir - Path to the migrations directory
 * @returns Result of the migration run
 */
export async function runMigrations(migrationsDir: string): Promise<MigrationResult> {
  const result: MigrationResult = { applied: [], skipped: [] };

  if (!isDatabaseConfigured()) {
    result.error = 'Database not configured - missing DATABASE_URL environment variable';
    return result;
  }

  try {
    await ensureMigrationsTable();

    const applied = await getAppliedMigrations();
    const files = getMigrationFiles(migrationsDir);

    for (const file of files) {
      const migrationName = file.replace('.sql', '');

      if (applied.includes(migrationName)) {
        result.skipped.push(migrationName);
        logger.debug(`Skipping already-applied migration: ${migrationName}`);
        continue;
      }

      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf-8');

      // Filter out the migrations table creation (handled above)
      // and execute the rest of the migration
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .filter((s) => !s.includes('CREATE TABLE IF NOT EXISTS migrations'));

      for (const statement of statements) {
        // Use raw tagged template for each statement
        const strings = [statement] as unknown as TemplateStringsArray;
        Object.defineProperty(strings, 'raw', { value: [statement] });
        await query(strings);
      }

      // Record the migration
      await query`
        INSERT INTO migrations (name) VALUES (${migrationName})
      `;

      result.applied.push(migrationName);
      logger.info(`Applied migration: ${migrationName}`);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown migration error';
    result.error = errorMessage;
    logger.error('Migration failed', { error: errorMessage });
    return result;
  }
}
