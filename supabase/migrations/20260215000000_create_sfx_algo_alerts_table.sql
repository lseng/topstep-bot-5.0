-- Create sfx_algo_alerts table for raw TradingView "any alert() function call" payloads
-- from SFX Algo trade signal indicators

CREATE TABLE sfx_algo_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT,
  raw_body TEXT NOT NULL,
  content_type TEXT
);

CREATE INDEX idx_sfx_algo_alerts_created_at ON sfx_algo_alerts(created_at DESC);

ALTER TABLE sfx_algo_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON sfx_algo_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow service insert" ON sfx_algo_alerts FOR INSERT TO service_role WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE sfx_algo_alerts;
