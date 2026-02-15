-- Create informational_events table for raw TradingView "any alert() function call" payloads
-- from informational/indicator alerts (SMC/ICT events like BOS, CHoCH, FVG, OB, etc.)

CREATE TABLE informational_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT,
  raw_body TEXT NOT NULL,
  content_type TEXT
);

CREATE INDEX idx_informational_events_created_at ON informational_events(created_at DESC);

ALTER TABLE informational_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON informational_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow service insert" ON informational_events FOR INSERT TO service_role WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE informational_events;
