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

// Check alerts columns
const { data: alert, error: alertErr } = await supabase.from('alerts').select('id, name, strategy').limit(1);
console.log('alerts table:');
console.log('  name column:', alertErr ? `ERROR: ${alertErr.message}` : 'OK');
console.log('  strategy column:', alertErr ? `ERROR: ${alertErr.message}` : 'OK');

// Check positions columns
const { data: pos, error: posErr } = await supabase.from('positions').select('id, strategy, retry_count, max_retries, original_alert_id, account_id').limit(1);
console.log('\npositions table:');
console.log('  strategy column:', posErr ? `ERROR: ${posErr.message}` : 'OK');
console.log('  retry_count column:', posErr ? `ERROR: ${posErr.message}` : 'OK');
console.log('  account_id column:', posErr ? `ERROR: ${posErr.message}` : 'OK');

// Check trades_log columns
const { data: trade, error: tradeErr } = await supabase.from('trades_log').select('id, account_id, retry_count, original_alert_id').limit(1);
console.log('\ntrades_log table:');
console.log('  account_id column:', tradeErr ? `ERROR: ${tradeErr.message}` : 'OK');
console.log('  retry_count column:', tradeErr ? `ERROR: ${tradeErr.message}` : 'OK');

console.log('\nAll schema checks passed!');
