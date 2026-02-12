-- Migration: 001_create_alerts_table
-- Description: Create alerts table for storing webhook alert data with OHLCV fields
-- Created: 2026-02-11

-- Create migrations tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  interval TEXT,
  alert_time TIMESTAMPTZ,
  open_price DECIMAL,
  high_price DECIMAL,
  low_price DECIMAL,
  close_price DECIMAL,
  bar_volume INTEGER,
  order_type TEXT,
  price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on symbol and created_at for common queries
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts (symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
