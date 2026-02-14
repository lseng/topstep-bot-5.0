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

// Check: any alerts where name starts with "day-trader-" but action doesn't match the BUY/SELL intent?
// Also check raw_payload action field
const { data, error } = await supabase
  .from('alerts')
  .select('id, created_at, symbol, action, name, raw_payload')
  .order('created_at', { ascending: true });

if (error) { console.error('Error:', error.message); process.exit(1); }

console.log(`Total alerts in DB: ${data!.length}\n`);

let mismatches = 0;
let rawPayloadMismatches = 0;
let nullNames = 0;

for (const row of data!) {
  if (!row.name) {
    nullNames++;
    continue;
  }

  // Check raw_payload action vs DB action
  if (row.raw_payload && typeof row.raw_payload === 'object') {
    const payloadAction = (row.raw_payload as Record<string, unknown>).action;
    if (payloadAction && payloadAction !== row.action) {
      rawPayloadMismatches++;
      console.log(`RAW_PAYLOAD MISMATCH: ${row.created_at} | ${row.symbol.padEnd(4)} | DB action: ${row.action} | raw_payload.action: ${payloadAction} | name: ${row.name}`);
    }
  }
}

if (nullNames > 0) {
  console.log(`\nAlerts with null name: ${nullNames}`);
}
if (rawPayloadMismatches > 0) {
  console.log(`\nraw_payload action mismatches: ${rawPayloadMismatches}`);
} else {
  console.log('\nAll raw_payload actions match DB actions.');
}
console.log(`\nTotal mismatches: ${mismatches}`);
console.log(`Total raw_payload mismatches: ${rawPayloadMismatches}`);
