-- Create positions table for tracking bot-managed positions
-- Includes VPVR data, TP/SL levels, and LLM analysis fields

-- Create enum types for position state machine and side
CREATE TYPE position_state AS ENUM (
  'pending_entry', 'active', 'tp1_hit', 'tp2_hit', 'tp3_hit', 'closed', 'cancelled'
);
CREATE TYPE position_side AS ENUM ('long', 'short');

-- Create positions table
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  alert_id UUID REFERENCES alerts(id),
  symbol TEXT NOT NULL,
  side position_side NOT NULL,
  state position_state DEFAULT 'pending_entry' NOT NULL,
  entry_order_id INTEGER,
  entry_price DECIMAL(12, 4),
  target_entry_price DECIMAL(12, 4),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  contract_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  current_sl DECIMAL(12, 4),
  initial_sl DECIMAL(12, 4),
  tp1_price DECIMAL(12, 4),
  tp2_price DECIMAL(12, 4),
  tp3_price DECIMAL(12, 4),
  unrealized_pnl DECIMAL(12, 4) DEFAULT 0,
  last_price DECIMAL(12, 4),
  vpvr_data JSONB,
  confirmation_score INTEGER,
  exit_price DECIMAL(12, 4),
  exit_reason TEXT,
  closed_at TIMESTAMPTZ,
  llm_reasoning TEXT,
  llm_confidence DECIMAL(5, 2)
);

-- Create indexes for common queries
CREATE INDEX idx_positions_symbol ON positions (symbol);
CREATE INDEX idx_positions_state ON positions (state);
CREATE INDEX idx_positions_created_at ON positions (created_at DESC);
CREATE INDEX idx_positions_symbol_state ON positions (symbol, state);
CREATE INDEX idx_positions_alert_id ON positions (alert_id);

-- Enable Row Level Security (RLS)
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Service role has full access to positions" ON positions
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE positions IS 'Bot-managed trading positions with VPVR-based entry and trailing TP/SL';
