-- Full schema update: add missing columns to positions, trades_log, and alerts
-- Idempotent: safe to re-run if tables already exist from earlier migrations

-- 1. Add new columns to alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS strategy TEXT;

-- 2. Add 'pending_retry' to position_state enum (IF NOT EXISTS handles idempotency)
ALTER TYPE position_state ADD VALUE IF NOT EXISTS 'pending_retry';

-- 3. Ensure enum types exist (no-op if earlier migration created them)
DO $$ BEGIN
  CREATE TYPE position_state AS ENUM (
    'pending_entry', 'active', 'tp1_hit', 'tp2_hit', 'tp3_hit',
    'closed', 'cancelled', 'pending_retry'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE position_side AS ENUM ('long', 'short');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create positions table if not exists (no-op if earlier migration created it)
CREATE TABLE IF NOT EXISTS positions (
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
  llm_confidence DECIMAL(5, 2),
  strategy TEXT DEFAULT 'vpvr',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 0,
  original_alert_id TEXT
);

-- 5. Add missing columns to positions (if table was created by earlier migration)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT 'vpvr';
ALTER TABLE positions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS original_alert_id TEXT;

CREATE INDEX IF NOT EXISTS idx_positions_symbol_state ON positions (symbol, state);
CREATE INDEX IF NOT EXISTS idx_positions_alert_id ON positions (alert_id);
CREATE INDEX IF NOT EXISTS idx_positions_account_id ON positions (account_id);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role has full access" ON positions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anon can read positions" ON positions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Create trades_log table if not exists (no-op if earlier migration created it)
CREATE TABLE IF NOT EXISTS trades_log (
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
  metadata JSONB DEFAULT '{}'::JSONB,
  account_id INTEGER,
  retry_count INTEGER DEFAULT 0,
  original_alert_id TEXT
);

-- 7. Add missing columns to trades_log (if table was created by earlier migration)
ALTER TABLE trades_log ADD COLUMN IF NOT EXISTS account_id INTEGER;
ALTER TABLE trades_log ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE trades_log ADD COLUMN IF NOT EXISTS original_alert_id TEXT;

CREATE INDEX IF NOT EXISTS idx_trades_log_position_id ON trades_log (position_id);
CREATE INDEX IF NOT EXISTS idx_trades_log_symbol_created ON trades_log (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_log_account_id ON trades_log (account_id);

ALTER TABLE trades_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role has full access" ON trades_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anon can read trades_log" ON trades_log FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Enable Realtime for positions (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE positions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Done!
SELECT 'Migration complete' AS status;
