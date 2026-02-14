// E2E test: Verify bars_1m table schema matches expected columns and constraints
// Validates the migration SQL and database types are consistent

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const migrationSql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260214000000_create_bars_1m_table.sql'),
  'utf-8',
);

describe('bars_1m table schema', () => {
  it('migration file exists and is non-empty', () => {
    expect(migrationSql.length).toBeGreaterThan(0);
  });

  it('creates bars_1m table', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS bars_1m');
  });

  describe('required columns', () => {
    const requiredColumns = [
      'id UUID PRIMARY KEY',
      'symbol TEXT NOT NULL',
      'contract_id TEXT NOT NULL',
      'timestamp TIMESTAMPTZ NOT NULL',
      'open DECIMAL',
      'high DECIMAL',
      'low DECIMAL',
      'close DECIMAL',
      'volume INTEGER NOT NULL',
      'tick_count INTEGER',
      'fetched_at TIMESTAMPTZ',
    ];

    for (const col of requiredColumns) {
      it(`has column: ${col.split(' ')[0]}`, () => {
        expect(migrationSql).toContain(col);
      });
    }
  });

  it('has unique constraint on (symbol, timestamp)', () => {
    expect(migrationSql).toContain('UNIQUE (symbol, timestamp)');
  });

  it('has index on (symbol, timestamp)', () => {
    expect(migrationSql).toContain('idx_bars_1m_symbol_timestamp ON bars_1m (symbol, timestamp)');
  });

  it('has index on timestamp', () => {
    expect(migrationSql).toContain('idx_bars_1m_timestamp ON bars_1m (timestamp)');
  });

  it('has index on contract_id', () => {
    expect(migrationSql).toContain('idx_bars_1m_contract_id ON bars_1m (contract_id)');
  });

  it('enables RLS', () => {
    expect(migrationSql).toContain('ALTER TABLE bars_1m ENABLE ROW LEVEL SECURITY');
  });

  it('has service role full access policy', () => {
    expect(migrationSql).toContain('Service role has full access to bars_1m');
  });

  it('has anon read-only policy', () => {
    expect(migrationSql).toContain('Anon can read bars_1m');
  });
});

describe('bars_1m database types', () => {
  // Validate the types file includes bars_1m definitions
  const typesFile = readFileSync(
    join(__dirname, '../../src/types/database.ts'),
    'utf-8',
  );

  it('defines bars_1m Row type', () => {
    expect(typesFile).toContain('bars_1m:');
    expect(typesFile).toContain('Row: {');
  });

  it('Row type includes all required fields', () => {
    // These fields should appear within the bars_1m section
    const fields = ['symbol:', 'contract_id:', 'timestamp:', 'open:', 'high:', 'low:', 'close:', 'volume:', 'tick_count:', 'fetched_at:'];
    for (const field of fields) {
      expect(typesFile).toContain(field);
    }
  });

  it('defines bars_1m Insert type', () => {
    expect(typesFile).toContain('Insert: {');
  });

  it('defines bars_1m Update type', () => {
    expect(typesFile).toContain('Update: {');
  });
});
