-- Create bars_1m table for storing 1-minute OHLCV bar data from TopstepX API
-- Used for backtesting and ML optimization

CREATE TABLE IF NOT EXISTS bars_1m (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open DECIMAL(14, 4) NOT NULL,
  high DECIMAL(14, 4) NOT NULL,
  low DECIMAL(14, 4) NOT NULL,
  close DECIMAL(14, 4) NOT NULL,
  volume INTEGER NOT NULL DEFAULT 0,
  tick_count INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent duplicate bars for the same symbol + timestamp
  CONSTRAINT bars_1m_symbol_timestamp_unique UNIQUE (symbol, timestamp)
);

-- Primary query pattern: fetch bars for a symbol within a time range
CREATE INDEX IF NOT EXISTS idx_bars_1m_symbol_timestamp ON bars_1m (symbol, timestamp);

-- Query by timestamp range across all symbols
CREATE INDEX IF NOT EXISTS idx_bars_1m_timestamp ON bars_1m (timestamp);

-- Query by contract_id (useful for debugging expiry issues)
CREATE INDEX IF NOT EXISTS idx_bars_1m_contract_id ON bars_1m (contract_id);

-- Enable RLS
ALTER TABLE bars_1m ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DO $$ BEGIN
  CREATE POLICY "Service role has full access to bars_1m" ON bars_1m
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Anon: read-only (for dashboard queries)
DO $$ BEGIN
  CREATE POLICY "Anon can read bars_1m" ON bars_1m
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE bars_1m IS '1-minute OHLCV bar data from TopstepX API, used for backtesting and ML optimization';
