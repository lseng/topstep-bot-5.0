-- Add alert_source column to positions and trades_log tables
-- Tracks where the alert originated (e.g. 'sfx_algo_alerts', 'alerts', 'manual')

ALTER TABLE positions ADD COLUMN IF NOT EXISTS alert_source TEXT;
ALTER TABLE trades_log ADD COLUMN IF NOT EXISTS alert_source TEXT;

-- Drop legacy LLM columns that are no longer used
ALTER TABLE positions DROP COLUMN IF EXISTS llm_reasoning;
ALTER TABLE positions DROP COLUMN IF EXISTS llm_confidence;
ALTER TABLE trades_log DROP COLUMN IF EXISTS llm_reasoning;
