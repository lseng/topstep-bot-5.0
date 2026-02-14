import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

try {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch { /* */ }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data, error } = await supabase
  .from('alerts')
  .select('id, symbol, action, name, raw_payload, created_at')
  .order('created_at', { ascending: true });

if (error) { console.error('Error:', error.message); process.exit(1); }

let fixed = 0;
for (const row of data!) {
  if (!row.raw_payload || typeof row.raw_payload !== 'object') continue;

  const payload = row.raw_payload as Record<string, unknown>;
  if (payload.action && payload.action !== row.action) {
    // Fix the raw_payload action to match the DB action
    const updatedPayload = { ...payload, action: row.action };
    const { error: updateErr } = await supabase
      .from('alerts')
      .update({ raw_payload: updatedPayload })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`Failed to update ${row.id}:`, updateErr.message);
    } else {
      console.log(`Fixed: ${row.created_at} | ${row.symbol.padEnd(4)} | ${payload.action} -> ${row.action}`);
      fixed++;
    }
  }
}

console.log(`\nFixed ${fixed} raw_payload mismatches.`);
