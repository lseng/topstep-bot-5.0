-- Create alerts table for storing TradingView webhook alerts
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/mmudpobhfstanoenoumz/sql

-- Create enum types
CREATE TYPE trade_action AS ENUM ('buy', 'sell', 'close', 'close_long', 'close_short');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE alert_status AS ENUM ('received', 'processing', 'executed', 'failed', 'cancelled');

-- Create alerts table
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  symbol TEXT NOT NULL,
  action trade_action NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  order_type order_type DEFAULT 'market',
  price DECIMAL(12, 4),
  stop_loss DECIMAL(12, 4),
  take_profit DECIMAL(12, 4),
  comment TEXT,
  status alert_status DEFAULT 'received' NOT NULL,
  error_message TEXT,
  order_id TEXT,
  executed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX idx_alerts_symbol ON alerts (symbol);
CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_symbol_created ON alerts (symbol, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Service role has full access" ON alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE alerts IS 'TradingView webhook alerts received by the bot';
