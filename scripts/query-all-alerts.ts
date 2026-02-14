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
} catch {}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data, error } = await supabase
  .from('alerts')
  .select('id, created_at, symbol, action, price, status, name, strategy')
  .order('created_at', { ascending: true });

if (error) { console.error('Error:', error.message); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
