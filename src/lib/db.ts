// Database connection utility for Neon Serverless Postgres

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { logger } from './logger';


// Lazy-initialized SQL query function
let sqlInstance: NeonQueryFunction<false, false> | null = null;

/**
 * Get the SQL query function
 * Creates connection on first use
 */
function getSql(): NeonQueryFunction<false, false> {
  if (sqlInstance) {
    return sqlInstance;
  }

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error('Database not configured - missing DATABASE_URL environment variable');
  }

  sqlInstance = neon(connectionString);
  return sqlInstance;
}

/**
 * Get the database connection URL
 */
function getDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim()
  );
}

/**
 * Check if database is configured (DATABASE_URL exists)
 */
export function isDatabaseConfigured(): boolean {
  return !!getDatabaseUrl();
}

/**
 * Get database connection status
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  if (!isDatabaseConfigured()) {
    return {
      connected: false,
      error: 'Database not configured - missing DATABASE_URL environment variable',
    };
  }

  try {
    const sql = getSql();
    const result = await sql`SELECT 1 as health_check`;
    if (result[0]?.health_check === 1) {
      logger.debug('Database connection successful');
      return { connected: true };
    }
    return { connected: false, error: 'Unexpected health check response' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Database connection failed', { error: errorMessage });
    return { connected: false, error: errorMessage };
  }
}

/**
 * Execute a parameterized query using tagged template literals
 * This is the preferred way to run queries with @neondatabase/serverless
 *
 * @example
 * const result = await query`SELECT * FROM alerts WHERE symbol = ${symbol}`;
 */
export function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const sql = getSql();
  return sql(strings, ...values) as Promise<T[]>;
}

/**
 * Execute a raw SQL query with parameters
 * Use this for dynamic queries where tagged templates are not suitable
 *
 * @param text - SQL query string with $1, $2, etc. placeholders
 * @param values - Array of parameter values
 */
export async function rawQuery<T = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const sql = getSql();
  // Use tagged template literal with escaped values for safety
  // For truly dynamic queries, construct the template strings array
  const strings = [text] as unknown as TemplateStringsArray;
  Object.defineProperty(strings, 'raw', { value: [text] });
  const result = (await sql(strings, ...(values ?? []))) as T[];
  return {
    rows: result,
    rowCount: result.length,
  };
}

/**
 * Reset the SQL instance (useful for testing)
 */
export function resetConnection(): void {
  sqlInstance = null;
}
