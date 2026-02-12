-- Enable Supabase Realtime for live dashboard updates
-- Adds alerts table to the Realtime publication so browser clients
-- receive INSERT/UPDATE events via WebSocket.
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- Allow anonymous (anon key) read-only access to alerts.
-- The dashboard uses the Supabase anon key in the browser;
-- this policy lets it SELECT alerts while RLS stays enabled.
CREATE POLICY "Anon can read alerts" ON alerts
  FOR SELECT USING (true);
