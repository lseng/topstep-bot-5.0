-- Drop foreign key constraints on alert_id that reference the alerts table.
-- Positions and trades_log now reference sfx_algo_alerts IDs, not alerts table IDs.

ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_alert_id_fkey;
ALTER TABLE trades_log DROP CONSTRAINT IF EXISTS trades_log_alert_id_fkey;
