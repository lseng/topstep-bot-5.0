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
  .select('id, created_at, symbol, action, name, raw_payload, price')
  .order('created_at', { ascending: true });

if (error) { console.error('Error:', error.message); process.exit(1); }

const alerts = data!;
let issues = 0;

console.log(`Total alerts: ${alerts.length}\n`);

// 1. Check for null names
const nullNames = alerts.filter(a => !a.name);
if (nullNames.length > 0) {
  console.log(`❌ ${nullNames.length} alerts with null name:`);
  for (const a of nullNames) {
    console.log(`   ${a.created_at} | ${a.symbol} | ${a.action}`);
  }
  issues += nullNames.length;
} else {
  console.log(`✅ All alerts have a name`);
}

// 2. Check for missing OHLCV in raw_payload
const missingOhlcv = alerts.filter(a => {
  const raw = a.raw_payload as Record<string, unknown> | null;
  if (!raw) return true;
  return typeof raw.open !== 'number';
});
if (missingOhlcv.length > 0) {
  console.log(`❌ ${missingOhlcv.length} alerts missing OHLCV in raw_payload:`);
  for (const a of missingOhlcv) {
    console.log(`   ${a.created_at} | ${a.symbol} | ${a.action} | ${a.name}`);
  }
  issues += missingOhlcv.length;
} else {
  console.log(`✅ All alerts have OHLCV in raw_payload`);
}

// 3. Check raw_payload.action matches DB action
const actionMismatches = alerts.filter(a => {
  const raw = a.raw_payload as Record<string, unknown> | null;
  if (!raw || !raw.action) return false;
  return raw.action !== a.action;
});
if (actionMismatches.length > 0) {
  console.log(`❌ ${actionMismatches.length} raw_payload.action mismatches:`);
  for (const a of actionMismatches) {
    const raw = a.raw_payload as Record<string, unknown>;
    console.log(`   ${a.created_at} | ${a.symbol} | DB: ${a.action} | payload: ${raw.action}`);
  }
  issues += actionMismatches.length;
} else {
  console.log(`✅ All raw_payload.action fields match DB action`);
}

// 4. Check for missing alertTime/time in raw_payload
const missingTime = alerts.filter(a => {
  const raw = a.raw_payload as Record<string, unknown> | null;
  if (!raw) return true;
  return !raw.time && !raw.alertTime;
});
if (missingTime.length > 0) {
  console.log(`❌ ${missingTime.length} alerts missing time in raw_payload:`);
  for (const a of missingTime) {
    console.log(`   ${a.created_at} | ${a.symbol} | ${a.name}`);
  }
  issues += missingTime.length;
} else {
  console.log(`✅ All alerts have time in raw_payload`);
}

// 5. Summary by strategy
const byName: Record<string, number> = {};
for (const a of alerts) {
  const n = a.name ?? 'null';
  byName[n] = (byName[n] || 0) + 1;
}
console.log(`\n--- Alerts by strategy ---`);
for (const [name, count] of Object.entries(byName)) {
  console.log(`  ${name}: ${count}`);
}

console.log(`\n${issues === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${issues} issues found`}`);
