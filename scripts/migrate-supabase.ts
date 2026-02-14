// One-time migration: add name to alerts, account_id to trades_log
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim();
  }
}

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function runSQL(sql: string, label: string): Promise<void> {
  const resp = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ name: 'exec_sql', args: { sql } }),
  });

  if (!resp.ok) {
    // Fallback: use the Supabase Management API or pg-meta
    const pgResp = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!pgResp.ok) {
      console.log(`${label}: RPC/pg not available (${resp.status}/${pgResp.status}). Run manually in Supabase SQL editor:`);
      console.log(`  ${sql}`);
      return;
    }
    console.log(`${label}: OK (via pg)`);
    return;
  }
  console.log(`${label}: OK`);
}

async function main(): Promise<void> {
  console.log('Running Supabase migrations...\n');

  await runSQL(
    'ALTER TABLE alerts ADD COLUMN IF NOT EXISTS name TEXT;',
    'alerts.name',
  );

  await runSQL(
    'ALTER TABLE trades_log ADD COLUMN IF NOT EXISTS account_id INTEGER;',
    'trades_log.account_id',
  );

  // Verify columns exist by querying
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key);

  const { data: alertSample } = await sb.from('alerts').select('id, name').limit(1);
  if (alertSample) {
    console.log('\nalerts.name column accessible:', alertSample.length >= 0 ? 'YES' : 'NO');
  }

  const { data: tradeSample } = await sb.from('trades_log').select('id, account_id').limit(1);
  if (tradeSample) {
    console.log('trades_log.account_id column accessible:', tradeSample.length >= 0 ? 'YES' : 'NO');
  }

  console.log('\nDone!');
}

main().catch((err) => console.error('Error:', err));
