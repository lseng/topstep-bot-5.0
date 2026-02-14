/* eslint-disable no-console */
/**
 * Fetch 1-minute bar data from TopstepX API and store in Supabase bars_1m table.
 *
 * - Fetches in batches of 500 bars (API limit) per request
 * - Works backwards from now, day by day
 * - Handles rate limiting with exponential backoff
 * - Deduplicates via ON CONFLICT (symbol, timestamp)
 * - Reports gaps in the data
 *
 * Usage: npx vite-node scripts/fetch-1m-bars.ts [--days 30] [--symbols MES,MNQ,ES,NQ]
 */

import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  authenticate,
  getHistoricalBars,
  getCurrentContractId,
} from '../src/services/topstepx/client';
import { BarUnit, CONTRACT_SPECS } from '../src/services/topstepx/types';
import type { Bar } from '../src/services/topstepx/types';

// ─── Load env ───────────────────────────────────────────────────────────────

function loadEnv(): void {
  try {
    const content = readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
      }
    }
  } catch { /* noop */ }
}

loadEnv();

// ─── CLI Args ───────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

// ─── Config ─────────────────────────────────────────────────────────────────

// Symbols that have CONTRACT_SPECS and are likely available in the API
const DEFAULT_SYMBOLS = ['ES', 'NQ', 'MES', 'MNQ', 'MYM', 'MGC'];

// CME futures trading hours (US/Eastern): Sunday 6pm - Friday 5pm
// Roughly 23 hours/day, 5 days/week
const BARS_PER_SESSION = 23 * 60; // ~1380 bars per trading day
const API_BATCH_LIMIT = 500;
const RATE_LIMIT_DELAY_MS = 1500; // Base delay between requests
const MAX_RETRIES = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface FetchStats {
  symbol: string;
  totalBars: number;
  newBars: number;
  duplicates: number;
  errors: number;
  earliestBar: string | null;
  latestBar: string | null;
  gaps: GapInfo[];
}

interface GapInfo {
  from: string;
  to: string;
  durationMinutes: number;
}

// ─── Fetch bars for a single symbol across a date range ─────────────────────

async function fetchBarsForSymbol(
  supabase: SupabaseClient,
  symbol: string,
  daysBack: number,
): Promise<FetchStats> {
  const stats: FetchStats = {
    symbol,
    totalBars: 0,
    newBars: 0,
    duplicates: 0,
    errors: 0,
    earliestBar: null,
    latestBar: null,
    gaps: [],
  };

  let contractId: string;
  try {
    contractId = getCurrentContractId(symbol);
  } catch {
    console.log(`  [SKIP] ${symbol}: no contract spec`);
    return stats;
  }

  console.log(`  ${symbol} (contract: ${contractId})`);

  // Check what we already have in Supabase — only fetch what's new
  const { data: latestRow } = await supabase
    .from('bars_1m')
    .select('timestamp')
    .eq('symbol', symbol)
    .order('timestamp', { ascending: false })
    .limit(1);

  const now = new Date();
  const fullStartDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  let fetchFrom: Date;
  if (latestRow && latestRow.length > 0) {
    // Resume from 1 minute after the latest bar we already have
    fetchFrom = new Date(new Date(latestRow[0].timestamp).getTime() + 60 * 1000);
    console.log(`    Existing data up to ${latestRow[0].timestamp}`);
    console.log(`    Fetching only new data from ${fetchFrom.toISOString()}`);
  } else {
    fetchFrom = fullStartDate;
    console.log(`    No existing data — fetching full ${daysBack}-day history`);
  }

  // Nothing new to fetch
  if (fetchFrom.getTime() >= now.getTime()) {
    console.log(`    ${symbol}: already up to date`);
    return stats;
  }

  // Walk backwards in 8-hour windows (480 bars per request, under 500 limit)
  const windowMs = 8 * 60 * 60 * 1000; // 8 hours in ms
  const startDate = fetchFrom;

  let windowEnd = now;
  let requestCount = 0;
  const allBars: Bar[] = [];

  while (windowEnd.getTime() > startDate.getTime()) {
    const windowStart = new Date(Math.max(
      windowEnd.getTime() - windowMs,
      startDate.getTime(),
    ));

    let retries = 0;
    let success = false;

    while (retries < MAX_RETRIES && !success) {
      try {
        const bars = await getHistoricalBars({
          contractId,
          live: false,
          startTime: windowStart.toISOString(),
          endTime: windowEnd.toISOString(),
          unit: BarUnit.MINUTE,
          unitNumber: 1,
          limit: API_BATCH_LIMIT,
        });

        if (bars.length > 0) {
          allBars.push(...bars);
          stats.totalBars += bars.length;
        }

        success = true;
        requestCount++;

        // Progress indicator every 5 requests
        if (requestCount % 5 === 0) {
          const pct = Math.round(((now.getTime() - windowEnd.getTime()) / (now.getTime() - startDate.getTime())) * 100);
          console.log(`    ${symbol}: ${stats.totalBars} bars fetched (${pct}% complete)`);
        }
      } catch (err: unknown) {
        retries++;
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('429')) {
          // Rate limited — exponential backoff
          const backoff = RATE_LIMIT_DELAY_MS * Math.pow(2, retries);
          console.log(`    [RATE LIMIT] ${symbol}: waiting ${backoff}ms (retry ${retries}/${MAX_RETRIES})`);
          await sleep(backoff);
        } else {
          console.log(`    [ERROR] ${symbol}: ${msg} (retry ${retries}/${MAX_RETRIES})`);
          stats.errors++;
          if (retries >= MAX_RETRIES) break;
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }
    }

    if (!success) {
      stats.errors++;
    }

    windowEnd = windowStart;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Deduplicate by timestamp (API may return overlapping data)
  const uniqueBars = new Map<string, Bar>();
  for (const bar of allBars) {
    const key = bar.t;
    if (!uniqueBars.has(key)) {
      uniqueBars.set(key, bar);
    }
  }

  const deduped = [...uniqueBars.values()].sort(
    (a, b) => new Date(a.t).getTime() - new Date(b.t).getTime()
  );

  stats.duplicates = allBars.length - deduped.length;

  if (deduped.length === 0) {
    console.log(`    ${symbol}: no bars retrieved`);
    return stats;
  }

  stats.earliestBar = deduped[0].t;
  stats.latestBar = deduped[deduped.length - 1].t;

  // Insert into Supabase in batches of 500
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const rows = batch.map(bar => ({
      symbol,
      contract_id: contractId,
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      tick_count: bar.tickCount ?? null,
    }));

    // Upsert to handle duplicates gracefully
    const { error } = await supabase
      .from('bars_1m')
      .upsert(rows as never[], { onConflict: 'symbol,timestamp', ignoreDuplicates: true });

    if (error) {
      console.log(`    [DB ERROR] ${symbol} batch ${i}-${i + batch.length}: ${error.message}`);
      stats.errors++;
    } else {
      inserted += batch.length;
    }
  }

  stats.newBars = inserted;
  console.log(`    ${symbol}: ${inserted} bars stored (${stats.duplicates} dupes skipped)`);

  // Analyze gaps
  stats.gaps = findGaps(deduped, symbol);

  return stats;
}

// ─── Gap Analysis ───────────────────────────────────────────────────────────

function findGaps(bars: Bar[], symbol: string): GapInfo[] {
  const gaps: GapInfo[] = [];
  if (bars.length < 2) return gaps;

  for (let i = 1; i < bars.length; i++) {
    const prev = new Date(bars[i - 1].t);
    const curr = new Date(bars[i].t);
    const diffMinutes = (curr.getTime() - prev.getTime()) / (60 * 1000);

    // Expected gap: 1 minute. Allow up to 5 minutes for minor gaps.
    // Gaps > 5 minutes during trading hours are notable.
    // Overnight gaps (17:00-18:00 ET) and weekend gaps are expected.
    if (diffMinutes > 5) {
      const prevHour = prev.getUTCHours();
      const currHour = curr.getUTCHours();
      const prevDay = prev.getUTCDay();
      const currDay = curr.getUTCDay();

      // Skip expected overnight/weekend gaps:
      // - Friday to Sunday transition (day 5 to 0)
      // - Daily maintenance window (typically 17:00-18:00 ET = 22:00-23:00 UTC)
      const isWeekendGap = (prevDay === 5 && currDay === 0) || (prevDay === 5 && currDay === 1);
      const isOvernightMaint = diffMinutes <= 90; // Maintenance window is ~60 min

      if (!isWeekendGap && !isOvernightMaint) {
        gaps.push({
          from: bars[i - 1].t,
          to: bars[i].t,
          durationMinutes: Math.round(diffMinutes),
        });
      }
    }
  }

  return gaps;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n========================================================');
  console.log('  FETCH 1-MINUTE BAR DATA — TopstepX → Supabase');
  console.log('========================================================\n');

  const symbolsArg = getArg('--symbols') ?? DEFAULT_SYMBOLS.join(',');
  const symbols = symbolsArg.split(',').map(s => s.trim().toUpperCase());
  const daysBack = parseInt(getArg('--days') ?? '30', 10);

  console.log(`Symbols: ${symbols.join(', ')}`);
  console.log(`Days back: ${daysBack}`);
  console.log(`API batch limit: ${API_BATCH_LIMIT}`);
  console.log(`Rate limit delay: ${RATE_LIMIT_DELAY_MS}ms\n`);

  // Connect
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[1/3] Authenticating with TopstepX API...');
  const ok = await authenticate();
  if (!ok) {
    console.error('Failed to authenticate');
    process.exit(1);
  }
  console.log('  Authenticated.\n');

  // First, probe how far back we can get data
  console.log('[2/3] Probing API limits...');
  const probeSymbol = symbols[0];
  const probeContractId = getCurrentContractId(probeSymbol);
  const probeRanges = [7, 14, 30, 60, 90];

  for (const days of probeRanges) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000); // 8-hour window at start
    try {
      const bars = await getHistoricalBars({
        contractId: probeContractId,
        live: false,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        unit: BarUnit.MINUTE,
        unitNumber: 1,
        limit: 10,
      });
      console.log(`  ${days} days back: ${bars.length > 0 ? `OK (${bars.length} bars in probe)` : 'NO DATA'}`);
      if (bars.length === 0) {
        console.log(`  API returns no data beyond ${probeRanges[probeRanges.indexOf(days) - 1] ?? 0} days`);
        break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${days} days back: ERROR (${msg})`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log('');

  // Fetch all symbols
  console.log(`[3/3] Fetching 1M bars for ${symbols.length} symbols (${daysBack} days)...\n`);

  const allStats: FetchStats[] = [];

  for (const symbol of symbols) {
    const stats = await fetchBarsForSymbol(supabase, symbol, daysBack);
    allStats.push(stats);
    console.log('');
  }

  // ─── Final Report ───────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(70));
  console.log('  DATA COLLECTION REPORT');
  console.log('='.repeat(70));

  let grandTotal = 0;
  let grandNew = 0;
  let grandErrors = 0;

  for (const s of allStats) {
    grandTotal += s.totalBars;
    grandNew += s.newBars;
    grandErrors += s.errors;

    console.log(`\n  ${s.symbol}:`);
    console.log(`    Bars fetched:  ${s.totalBars}`);
    console.log(`    Bars stored:   ${s.newBars} (${s.duplicates} duplicates)`);
    console.log(`    Errors:        ${s.errors}`);
    if (s.earliestBar && s.latestBar) {
      console.log(`    Range:         ${s.earliestBar} → ${s.latestBar}`);
    }

    if (s.gaps.length > 0) {
      console.log(`    Gaps (${s.gaps.length}):`);
      for (const g of s.gaps.slice(0, 10)) {
        console.log(`      ${g.from} → ${g.to} (${g.durationMinutes} min)`);
      }
      if (s.gaps.length > 10) {
        console.log(`      ... and ${s.gaps.length - 10} more`);
      }
    } else {
      console.log(`    Gaps:          None (clean data)`);
    }
  }

  // Verify total in Supabase
  const { count } = await supabase
    .from('bars_1m')
    .select('*', { count: 'exact', head: true });

  console.log('\n' + '-'.repeat(70));
  console.log(`  TOTALS:`);
  console.log(`    Total bars fetched:    ${grandTotal}`);
  console.log(`    Total bars in DB:      ${count ?? 'unknown'}`);
  console.log(`    Total errors:          ${grandErrors}`);
  console.log(`    Symbols covered:       ${allStats.filter(s => s.totalBars > 0).length}/${symbols.length}`);
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
