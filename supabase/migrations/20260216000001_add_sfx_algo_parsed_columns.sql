-- Add parsed columns to sfx_algo_alerts for structured querying
ALTER TABLE sfx_algo_alerts
  ADD COLUMN ticker TEXT,              -- 'ES1!', 'NQ1!' (raw TradingView ticker)
  ADD COLUMN symbol TEXT,              -- normalized: 'ES', 'NQ', 'MES', etc.
  ADD COLUMN alert_type TEXT,          -- 'buy', 'sell', 'TP1', 'TP2', 'TP3', 'sl'
  ADD COLUMN signal_direction TEXT,    -- 'bull', 'bear'
  ADD COLUMN price NUMERIC,            -- close price at signal time
  ADD COLUMN current_rating INTEGER,   -- 1 or 2 (entry signals only)
  ADD COLUMN tp1 NUMERIC,             -- take profit 1 (entry only)
  ADD COLUMN tp2 NUMERIC,             -- take profit 2 (entry only)
  ADD COLUMN tp3 NUMERIC,             -- take profit 3 (entry only)
  ADD COLUMN stop_loss NUMERIC,       -- stop loss (entry only)
  ADD COLUMN entry_price NUMERIC,     -- links exit back to entry (exit only)
  ADD COLUMN unix_time BIGINT;        -- candle timestamp in milliseconds

CREATE INDEX idx_sfx_symbol ON sfx_algo_alerts(symbol);
CREATE INDEX idx_sfx_alert_type ON sfx_algo_alerts(alert_type);
