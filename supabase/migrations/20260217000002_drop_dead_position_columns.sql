-- Drop unused columns from positions table
-- These were tracked in-memory but never written to the database

ALTER TABLE positions DROP COLUMN IF EXISTS strategy;
ALTER TABLE positions DROP COLUMN IF EXISTS retry_count;
ALTER TABLE positions DROP COLUMN IF EXISTS max_retries;
ALTER TABLE positions DROP COLUMN IF EXISTS original_alert_id;
ALTER TABLE positions DROP COLUMN IF EXISTS llm_reasoning;
ALTER TABLE positions DROP COLUMN IF EXISTS llm_confidence;
