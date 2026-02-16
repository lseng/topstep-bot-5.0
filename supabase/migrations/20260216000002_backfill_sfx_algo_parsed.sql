-- Backfill parsed columns from existing raw_body JSON
UPDATE sfx_algo_alerts
SET
  ticker = raw_body::jsonb->>'ticker',
  symbol = REPLACE(raw_body::jsonb->>'ticker', '1!', ''),
  alert_type = raw_body::jsonb->>'alert',
  signal_direction = raw_body::jsonb->>'signal_direction',
  price = (raw_body::jsonb->>'close')::numeric,
  current_rating = CASE
    WHEN raw_body::jsonb->>'current_rating' IS NOT NULL
    THEN (raw_body::jsonb->>'current_rating')::integer
    ELSE NULL
  END,
  tp1 = CASE
    WHEN raw_body::jsonb->>'alert' IN ('buy','sell')
    THEN (raw_body::jsonb->>'tp1')::numeric
    ELSE NULL
  END,
  tp2 = CASE
    WHEN raw_body::jsonb->>'alert' IN ('buy','sell')
    THEN (raw_body::jsonb->>'tp2')::numeric
    ELSE NULL
  END,
  tp3 = CASE
    WHEN raw_body::jsonb->>'alert' IN ('buy','sell')
    THEN (raw_body::jsonb->>'tp3')::numeric
    ELSE NULL
  END,
  stop_loss = CASE
    WHEN raw_body::jsonb->>'alert' IN ('buy','sell')
    THEN (raw_body::jsonb->>'sl')::numeric
    ELSE NULL
  END,
  entry_price = CASE
    WHEN raw_body::jsonb->>'alert' NOT IN ('buy','sell')
    THEN (raw_body::jsonb->>'entry_price')::numeric
    ELSE NULL
  END,
  unix_time = (raw_body::jsonb->>'unix_time')::bigint
WHERE ticker IS NULL;
