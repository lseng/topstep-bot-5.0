import { readFileSync } from 'fs';
import { authenticate, getAccounts } from '../src/services/topstepx/client';

// Load .env.local
try {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch { /* env vars already set */ }

async function main() {
  await authenticate();
  const accounts = await getAccounts();
  for (const a of accounts) {
    console.log(`Account ID: ${a.id} | Name: ${a.name} | Balance: ${a.balance}`);
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
