#!/usr/bin/env vite-node
/* eslint-disable no-console */
/**
 * Validate all CONTRACT_SPECS symbols against TopstepX Contract/search API.
 * Uses account 18206926 (50K sim, all symbols).
 *
 * Usage: npx vite-node scripts/validate-contracts.ts
 */

import { readFileSync } from 'fs';
import { authenticate, searchContracts, getCurrentContractId } from '../src/services/topstepx/client';

function loadEnv(): void {
  try {
    const content = readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ok */ }
}
loadEnv();
import { CONTRACT_SPECS } from '../src/services/topstepx/types';

const ACCOUNT_ID = 18206926;

async function main() {
  console.log('Authenticating...');
  await authenticate();
  console.log('Authenticated.\n');

  const symbols = Object.keys(CONTRACT_SPECS);
  console.log(`Testing ${symbols.length} symbols from CONTRACT_SPECS\n`);

  const results: { symbol: string; contractId: string; status: string; detail?: string }[] = [];

  for (const symbol of symbols) {
    const contractId = getCurrentContractId(symbol);
    try {
      const contracts = await searchContracts(symbol, ACCOUNT_ID);
      const match = contracts.find((c) => c.id === contractId);
      if (match) {
        results.push({ symbol, contractId, status: 'OK' });
        console.log(`  ✅ ${symbol.padEnd(6)} → ${contractId}`);
      } else {
        const ids = contracts.map((c) => c.id).join(', ');
        results.push({
          symbol,
          contractId,
          status: 'MISMATCH',
          detail: `Expected ${contractId}, found: ${ids || 'NONE'}`,
        });
        console.log(`  ❌ ${symbol.padEnd(6)} → ${contractId}  MISMATCH (found: ${ids || 'NONE'})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ symbol, contractId, status: 'ERROR', detail: msg });
      console.log(`  ❌ ${symbol.padEnd(6)} → ${contractId}  ERROR: ${msg}`);
    }
  }

  console.log('\n═══ SUMMARY ═══');
  const ok = results.filter((r) => r.status === 'OK');
  const fail = results.filter((r) => r.status !== 'OK');
  console.log(`  Passed: ${ok.length}/${results.length}`);
  if (fail.length > 0) {
    console.log(`  Failed: ${fail.length}`);
    for (const f of fail) {
      console.log(`    ${f.symbol}: ${f.detail}`);
    }
  }
  process.exit(fail.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
