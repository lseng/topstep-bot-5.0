-- Create trades_log table for immutable record of completed trades
-- Depends on: positions table (20260213000000)

CREATE TABLE trades_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  position_id UUID REFERENCES positions(id),
  alert_id UUID REFERENCES alerts(id),
  symbol TEXT NOT NULL,
  side position_side NOT NULL,
  entry_price DECIMAL(12, 4) NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  exit_price DECIMAL(12, 4) NOT NULL,
  exit_time TIMESTAMPTZ NOT NULL,
  exit_reason TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  gross_pnl DECIMAL(12, 4) NOT NULL,
  fees DECIMAL(12, 4) DEFAULT 0,
  net_pnl DECIMAL(12, 4) NOT NULL,
  vpvr_poc DECIMAL(12, 4),
  vpvr_vah DECIMAL(12, 4),
  vpvr_val DECIMAL(12, 4),
  highest_tp_hit TEXT,
  confirmation_score INTEGER,
  llm_reasoning TEXT,
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Create indexes for common queries
CREATE INDEX idx_trades_log_position_id ON trades_log (position_id);
CREATE INDEX idx_trades_log_symbol_created ON trades_log (symbol, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE trades_log ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Service role has full access" ON trades_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE trades_log IS 'Immutable record of completed trades with full entry/exit data and P&L';
