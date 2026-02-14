/* eslint-disable no-console */
/**
 * Verify which contract IDs actually work with the TopstepX API.
 * Tests each symbol by trying to fetch 1 bar of recent data.
 */
import { readFileSync } from 'fs';

function loadEnv(): void {
  try {
    const content = readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* noop */ }
}

loadEnv();

import { authenticate, getHistoricalBars, getCurrentContractId, searchContracts } from '../src/services/topstepx/client';
import { BarUnit, CONTRACT_SPECS } from '../src/services/topstepx/types';

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log('Authenticating...');
  await authenticate();

  const symbols = Object.keys(CONTRACT_SPECS);
  console.log(`\nTesting ${symbols.length} symbols:\n`);

  const works: string[] = [];
  const fails: string[] = [];
  const noData: string[] = [];

  for (const symbol of symbols) {
    const contractId = getCurrentContractId(symbol);
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day back

    try {
      const bars = await getHistoricalBars({
        contractId,
        live: false,
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        unit: BarUnit.MINUTE,
        unitNumber: 1,
        limit: 5,
      });

      if (bars.length > 0) {
        works.push(symbol);
        console.log(`  OK    ${symbol.padEnd(6)} ${contractId.padEnd(24)} ${bars.length} bars`);
      } else {
        noData.push(symbol);
        console.log(`  EMPTY ${symbol.padEnd(6)} ${contractId.padEnd(24)} 0 bars (try contract search)`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429')) {
        // Rate limited — wait and retry
        console.log(`  RATE  ${symbol.padEnd(6)} rate limited, waiting 5s...`);
        await sleep(5000);
        // Retry once
        try {
          const bars = await getHistoricalBars({
            contractId,
            live: false,
            startTime: start.toISOString(),
            endTime: now.toISOString(),
            unit: BarUnit.MINUTE,
            unitNumber: 1,
            limit: 5,
          });
          if (bars.length > 0) {
            works.push(symbol);
            console.log(`  OK    ${symbol.padEnd(6)} ${contractId.padEnd(24)} ${bars.length} bars (retry)`);
          } else {
            noData.push(symbol);
            console.log(`  EMPTY ${symbol.padEnd(6)} ${contractId.padEnd(24)} 0 bars (retry)`);
          }
        } catch {
          fails.push(symbol);
          console.log(`  FAIL  ${symbol.padEnd(6)} ${contractId.padEnd(24)} still rate limited`);
        }
      } else {
        fails.push(symbol);
        console.log(`  FAIL  ${symbol.padEnd(6)} ${contractId.padEnd(24)} ${msg.slice(0, 60)}`);
      }
    }

    await sleep(1200); // Rate limit protection
  }

  // For failed/noData symbols, try contract search to find correct prefix
  const needsSearch = [...fails, ...noData];
  if (needsSearch.length > 0) {
    console.log('\n--- Searching for correct contract IDs ---\n');
    for (const symbol of needsSearch) {
      try {
        const contracts = await searchContracts(symbol);
        if (contracts.length > 0) {
          console.log(`  ${symbol}:`);
          for (const c of contracts.slice(0, 3)) {
            console.log(`    ${c.id} — ${c.name} (tick: ${c.tickSize}, tickVal: ${c.tickValue})`);
          }
        } else {
          console.log(`  ${symbol}: no contracts found via search`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429')) {
          console.log(`  ${symbol}: rate limited`);
          await sleep(5000);
        } else {
          console.log(`  ${symbol}: search error — ${msg.slice(0, 60)}`);
        }
      }
      await sleep(1200);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  Working: ${works.length} — ${works.join(', ')}`);
  console.log(`  No data: ${noData.length} — ${noData.join(', ')}`);
  console.log(`  Failed:  ${fails.length} — ${fails.join(', ')}`);
}

main().catch(err => console.error('Fatal:', err));
