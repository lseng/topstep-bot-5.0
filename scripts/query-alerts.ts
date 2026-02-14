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
} catch { /* env vars already set */ }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const action = process.argv[2]; // 'query' or 'update'

if (action === 'update') {
  const id = process.argv[3];
  const newAction = process.argv[4];
  const { data, error } = await supabase
    .from('alerts')
    .update({ action: newAction })
    .eq('id', id)
    .select('id, created_at, symbol, action, price, status, name');
  if (error) { console.error('Error:', error.message); process.exit(1); }
  console.log('Updated:');
  console.table(data);
} else {
  const { data, error } = await supabase
    .from('alerts')
    .select('id, created_at, symbol, action, price, status, name')
    .ilike('symbol', '%NQ%')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { console.error('Error:', error.message); process.exit(1); }
  console.table(data);
}
