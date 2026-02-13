-- Enable Supabase Realtime for positions table
-- Add anon read policies for positions and trades_log

-- Add positions to Realtime publication for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE positions;

-- Allow anonymous read access to positions (dashboard uses anon key)
CREATE POLICY "Anon can read positions" ON positions
  FOR SELECT USING (true);

-- Allow anonymous read access to trades_log (dashboard uses anon key)
CREATE POLICY "Anon can read trades_log" ON trades_log
  FOR SELECT USING (true);
