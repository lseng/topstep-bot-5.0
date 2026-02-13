-- Enable Supabase Realtime for positions table
-- Allows dashboard to receive live position updates via WebSocket
ALTER PUBLICATION supabase_realtime ADD TABLE positions;

-- Allow anonymous (anon key) read-only access to positions and trades_log
CREATE POLICY "Anon can read positions" ON positions
  FOR SELECT USING (true);

CREATE POLICY "Anon can read trades_log" ON trades_log
  FOR SELECT USING (true);
