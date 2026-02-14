/* eslint-disable no-console */
/**
 * ML-Optimized Backtest Script
 *
 * Fetches real 1-minute bar data from TopstepX API, runs VPVR-based
 * backtests across a grid of parameter combinations, then refines
 * around the best configs to find the optimal setup per strategy.
 *
 * Usage: npx vite-node scripts/ml-optimize-backtest.ts
 */

import { readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Load environment ───────────────────────────────────────────────────────

function loadEnv(): void {
  try {
    const content = readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
      }
    }
  } catch {
    // env vars may already be set
  }
}

loadEnv();

// ─── Inline imports (to avoid module resolution issues) ─────────────────────

import { calculateVpvr } from '../src/services/vpvr/calculator';
import { calculateEntryPrice, calculateRetryEntryLevels, calculateSlFromEntry } from '../src/bot/entry-calculator';
import { evaluateTrailingStop } from '../src/bot/trailing-stop';
import { CONTRACT_SPECS, BarUnit } from '../src/services/topstepx/types';
import type { Bar } from '../src/services/topstepx/types';
import type { VpvrResult } from '../src/services/vpvr/types';
import type { ManagedPosition, PositionSide, PositionState } from '../src/bot/types';
import type { TradeAction } from '../src/types';
import { authenticate, getHistoricalBars, getCurrentContractId } from '../src/services/topstepx/client';

// ─── Extended contract specs for missing symbols ────────────────────────────

const EXTENDED_SPECS: Record<string, { tickSize: number; tickValue: number; pointValue: number; contractIdPrefix: string; expiryCycle: 'quarterly' | 'monthly' }> = {
  CL: { tickSize: 0.01, tickValue: 10.0, pointValue: 1000.0, contractIdPrefix: 'CON.F.US.CLE', expiryCycle: 'monthly' },
  YM: { tickSize: 1.0, tickValue: 5.0, pointValue: 5.0, contractIdPrefix: 'CON.F.US.EP.YM', expiryCycle: 'quarterly' },
  MNG: { tickSize: 0.005, tickValue: 5.0, pointValue: 1000.0, contractIdPrefix: 'CON.F.US.MNG', expiryCycle: 'monthly' },
};

function getPointValue(symbol: string): number {
  return CONTRACT_SPECS[symbol]?.pointValue ?? EXTENDED_SPECS[symbol]?.pointValue ?? 50;
}

function getTickSize(symbol: string): number {
  return CONTRACT_SPECS[symbol]?.tickSize ?? EXTENDED_SPECS[symbol]?.tickSize ?? 0.25;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface AlertData {
  id: string;
  symbol: string;
  action: TradeAction;
  name: string;
  created_at: string;
}

interface SimTrade {
  alertId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  entryFilled: boolean;
  exitReason: string;
  grossPnl: number;
  netPnl: number;
  highestTpHit: string | null;
  retryCount: number;
}

interface ConfigParams {
  slBufferTicks: number;
  maxRetries: number;
  numBins: number;
}

interface OptResult {
  config: ConfigParams;
  totalNetPnl: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradesTaken: number;
  wins: number;
  losses: number;
  avgNetPnl: number;
  trades: SimTrade[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculatePnl(side: PositionSide, entry: number, exit: number, quantity: number, symbol: string): number {
  const pv = getPointValue(symbol);
  const diff = side === 'long' ? exit - entry : entry - exit;
  return diff * pv * quantity;
}

function calcSharpe(pnls: number[]): number {
  if (pnls.length < 2) return 0;
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pnls.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

function calcMaxDrawdown(pnls: number[]): number {
  let peak = 0, maxDD = 0, cum = 0;
  for (const p of pnls) {
    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ─── Single trade simulation (1M bars, configurable numBins) ────────────────

function simulateTradeFromBars(
  alert: AlertData,
  bars: Bar[],
  config: ConfigParams,
): SimTrade[] {
  const results: SimTrade[] = [];

  // Calculate VPVR with configurable numBins
  const vpvr = calculateVpvr(bars, { numBins: config.numBins });
  if (!vpvr) return results;

  const side: PositionSide = alert.action === 'buy' ? 'long' : 'short';
  const isLong = side === 'long';

  // Calculate entry using our entry calculator
  const entry = calculateEntryPrice(alert.action, vpvr, {
    symbol: alert.symbol,
    slBufferTicks: config.slBufferTicks,
  });
  if (!entry) return results;

  // Walk bars to find entry fill
  let fillBarIdx = -1;
  const fillPrice = entry.entryPrice;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const filled = isLong ? bar.l <= entry.entryPrice : bar.h >= entry.entryPrice;
    if (filled) { fillBarIdx = i; break; }
  }

  if (fillBarIdx === -1) {
    results.push({
      alertId: alert.id, symbol: alert.symbol, side,
      entryPrice: entry.entryPrice, exitPrice: 0,
      entryFilled: false, exitReason: 'entry_never_filled',
      grossPnl: 0, netPnl: 0, highestTpHit: null, retryCount: 0,
    });
    return results;
  }

  // Calculate initial SL
  const initialSl = config.slBufferTicks > 0
    ? calculateSlFromEntry(fillPrice, side, alert.symbol, config.slBufferTicks)
    : entry.initialSl;

  // Build managed position
  const pos: ManagedPosition = {
    id: `opt-${alert.id}`, alertId: alert.id, symbol: alert.symbol, side,
    state: 'active' as PositionState, entryPrice: fillPrice,
    targetEntryPrice: entry.entryPrice, quantity: 1, contractId: '', accountId: 0,
    currentSl: initialSl, initialSl, tp1Price: entry.tp1, tp2Price: entry.tp2,
    tp3Price: entry.tp3, unrealizedPnl: 0, vpvrData: vpvr,
    createdAt: new Date(bars[fillBarIdx].t), updatedAt: new Date(bars[fillBarIdx].t),
    dirty: false, retryCount: 0, maxRetries: config.maxRetries,
    originalAlertId: alert.id, retryEntryLevels: [], strategy: 'vpvr',
  };

  let highestTpHit: string | null = null;
  let exitReason = 'bars_exhausted';
  let exitPrice = bars[bars.length - 1].c;
  let exitBarIdx = bars.length - 1;
  let tradeExited = false;

  for (let i = fillBarIdx; i < bars.length && !tradeExited; i++) {
    const bar = bars[i];
    const pricesToCheck = isLong ? [bar.l, bar.h] : [bar.h, bar.l];

    for (const price of pricesToCheck) {
      const result = evaluateTrailingStop(pos, price);
      if (result.shouldClose) {
        exitPrice = pos.currentSl;
        exitReason = result.closeReason ?? 'sl_hit';
        exitBarIdx = i;
        tradeExited = true;
        break;
      }
      if (result.newState) {
        pos.state = result.newState;
        if (result.newSl != null) pos.currentSl = result.newSl;
        if (result.newState === 'tp1_hit') highestTpHit = 'tp1';
        else if (result.newState === 'tp2_hit') highestTpHit = 'tp2';
        else if (result.newState === 'tp3_hit') highestTpHit = 'tp3';
      }
    }
  }

  const pnl = calculatePnl(side, fillPrice, exitPrice, 1, alert.symbol);
  results.push({
    alertId: alert.id, symbol: alert.symbol, side,
    entryPrice: fillPrice, exitPrice,
    entryFilled: true, exitReason, grossPnl: pnl, netPnl: pnl,
    highestTpHit, retryCount: 0,
  });

  // Simulate retries if enabled
  if (config.maxRetries > 0 && tradeExited && exitReason === 'sl_hit_from_active') {
    const retryLevels = calculateRetryEntryLevels(side, vpvr, config.maxRetries);
    const originalLevel = retryLevels[0];
    let lastExitBarIdx = exitBarIdx;
    let lastExitReason = exitReason;

    for (let retry = 1; retry <= config.maxRetries; retry++) {
      if (lastExitReason !== 'sl_hit_from_active') break;

      const steppedLevel = retryLevels[retry] ?? originalLevel;
      let retryFillIdx = -1;
      let retryFillPrice = steppedLevel;

      for (let i = lastExitBarIdx; i < bars.length; i++) {
        const bar = bars[i];
        const steppedFilled = isLong ? bar.l <= steppedLevel : bar.h >= steppedLevel;
        const fallbackFilled = isLong ? bar.l <= originalLevel : bar.h >= originalLevel;
        if (steppedFilled) { retryFillIdx = i; retryFillPrice = steppedLevel; break; }
        if (fallbackFilled) { retryFillIdx = i; retryFillPrice = originalLevel; break; }
      }

      if (retryFillIdx === -1) {
        results.push({
          alertId: alert.id, symbol: alert.symbol, side,
          entryPrice: steppedLevel, exitPrice: 0,
          entryFilled: false, exitReason: 'entry_never_filled',
          grossPnl: 0, netPnl: 0, highestTpHit: null, retryCount: retry,
        });
        break;
      }

      const retrySl = config.slBufferTicks > 0
        ? calculateSlFromEntry(retryFillPrice, side, alert.symbol, config.slBufferTicks)
        : (() => {
            const tp1d = isLong ? vpvr.poc - retryFillPrice : retryFillPrice - vpvr.poc;
            return isLong ? retryFillPrice - tp1d : retryFillPrice + tp1d;
          })();

      const retryPos: ManagedPosition = {
        id: `opt-retry-${alert.id}-${retry}`, alertId: alert.id, symbol: alert.symbol, side,
        state: 'active' as PositionState, entryPrice: retryFillPrice,
        targetEntryPrice: steppedLevel, quantity: 1, contractId: '', accountId: 0,
        currentSl: retrySl, initialSl: retrySl,
        tp1Price: entry.tp1, tp2Price: entry.tp2, tp3Price: entry.tp3,
        unrealizedPnl: 0, vpvrData: vpvr,
        createdAt: new Date(bars[retryFillIdx].t), updatedAt: new Date(bars[retryFillIdx].t),
        dirty: false, retryCount: retry, maxRetries: config.maxRetries,
        originalAlertId: alert.id, retryEntryLevels: retryLevels, strategy: 'vpvr',
      };

      let retryTpHit: string | null = null;
      let retryExitReason = 'bars_exhausted';
      let retryExitPrice = bars[bars.length - 1].c;
      let retryExited = false;

      for (let i = retryFillIdx; i < bars.length && !retryExited; i++) {
        const bar = bars[i];
        const pts = isLong ? [bar.l, bar.h] : [bar.h, bar.l];
        for (const price of pts) {
          const r = evaluateTrailingStop(retryPos, price);
          if (r.shouldClose) {
            retryExitPrice = retryPos.currentSl;
            retryExitReason = r.closeReason ?? 'sl_hit';
            lastExitBarIdx = i;
            lastExitReason = retryExitReason;
            retryExited = true;
            break;
          }
          if (r.newState) {
            retryPos.state = r.newState;
            if (r.newSl != null) retryPos.currentSl = r.newSl;
            if (r.newState === 'tp1_hit') retryTpHit = 'tp1';
            else if (r.newState === 'tp2_hit') retryTpHit = 'tp2';
            else if (r.newState === 'tp3_hit') retryTpHit = 'tp3';
          }
        }
      }

      const retryPnl = calculatePnl(side, retryFillPrice, retryExitPrice, 1, alert.symbol);
      results.push({
        alertId: alert.id, symbol: alert.symbol, side,
        entryPrice: retryFillPrice, exitPrice: retryExitPrice,
        entryFilled: true, exitReason: retryExitReason,
        grossPnl: retryPnl, netPnl: retryPnl,
        highestTpHit: retryTpHit, retryCount: retry,
      });

      if (!retryExited) break;
    }
  }

  return results;
}

// ─── Run backtest for one config ────────────────────────────────────────────

function runOptBacktest(
  alertsWithBars: Array<{ alert: AlertData; bars: Bar[] }>,
  config: ConfigParams,
): OptResult {
  const allTrades: SimTrade[] = [];

  for (const { alert, bars } of alertsWithBars) {
    const trades = simulateTradeFromBars(alert, bars, config);
    allTrades.push(...trades);
  }

  const filled = allTrades.filter(t => t.entryFilled);
  const wins = filled.filter(t => t.netPnl > 0);
  const losses = filled.filter(t => t.netPnl <= 0);
  const totalNetPnl = filled.reduce((s, t) => s + t.netPnl, 0);
  const grossWins = wins.reduce((s, t) => s + t.grossPnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.grossPnl, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  return {
    config,
    totalNetPnl,
    winRate: filled.length > 0 ? (wins.length / filled.length) * 100 : 0,
    profitFactor,
    sharpeRatio: calcSharpe(filled.map(t => t.netPnl)),
    maxDrawdown: calcMaxDrawdown(filled.map(t => t.netPnl)),
    tradesTaken: filled.length,
    wins: wins.length,
    losses: losses.length,
    avgNetPnl: filled.length > 0 ? totalNetPnl / filled.length : 0,
    trades: allTrades,
  };
}

// ─── Grid Search ────────────────────────────────────────────────────────────

function generateGrid(
  slRange: number[],
  retryRange: number[],
  binsRange: number[],
): ConfigParams[] {
  const configs: ConfigParams[] = [];
  for (const sl of slRange) {
    for (const retry of retryRange) {
      for (const bins of binsRange) {
        configs.push({ slBufferTicks: sl, maxRetries: retry, numBins: bins });
      }
    }
  }
  return configs;
}

// ─── Data Fetching ──────────────────────────────────────────────────────────

async function fetchAlerts(supabase: SupabaseClient, strategyName?: string): Promise<AlertData[]> {
  let query = supabase
    .from('alerts')
    .select('id, symbol, action, name, created_at')
    .in('action', ['buy', 'sell'])
    .order('created_at', { ascending: true });

  if (strategyName) {
    query = query.eq('name', strategyName);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch alerts: ${error.message}`);
  return (data ?? []) as AlertData[];
}

async function fetchBarsForAlert(alert: AlertData): Promise<Bar[]> {
  const symbol = alert.symbol;

  // Get contract ID — handle missing specs
  let contractId: string;
  if (CONTRACT_SPECS[symbol]) {
    contractId = getCurrentContractId(symbol);
  } else if (EXTENDED_SPECS[symbol]) {
    // Build manually for extended specs
    const spec = EXTENDED_SPECS[symbol];
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    let year = now.getFullYear();
    const expiryMonths = spec.expiryCycle === 'monthly'
      ? [1,2,3,4,5,6,7,8,9,10,11,12]
      : [3,6,9,12];
    let expiryMonth: number;
    const idx = expiryMonths.indexOf(month);
    if (idx !== -1 && day <= 19) { expiryMonth = month; }
    else {
      const next = expiryMonths.find(m => m > month);
      if (next) { expiryMonth = next; } else { expiryMonth = expiryMonths[0]; year += 1; }
    }
    const codes: Record<number,string> = {1:'F',2:'G',3:'H',4:'J',5:'K',6:'M',7:'N',8:'Q',9:'U',10:'V',11:'X',12:'Z'};
    contractId = `${spec.contractIdPrefix}.${codes[expiryMonth]}${String(year).slice(-2)}`;
  } else {
    console.warn(`  [SKIP] No contract spec for ${symbol}`);
    return [];
  }

  const alertTime = new Date(alert.created_at);
  // Fetch 120 bars before and 120 bars after = 4 hours of 1M data
  const startTime = new Date(alertTime.getTime() - 120 * 60 * 1000);
  const endTime = new Date(alertTime.getTime() + 120 * 60 * 1000);

  try {
    const bars = await getHistoricalBars({
      contractId,
      live: false,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      unit: BarUnit.MINUTE,
      unitNumber: 1,
      limit: 500,
    });
    return bars;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`  [WARN] Failed to fetch bars for ${symbol}: ${msg}`);
    return [];
  }
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function printResults(label: string, results: OptResult[]): void {
  // Sort by totalNetPnl descending
  const sorted = [...results].sort((a, b) => b.totalNetPnl - a.totalNetPnl);
  const top10 = sorted.slice(0, 10);

  console.log('\n' + '='.repeat(90));
  console.log(`  TOP 10 CONFIGS — ${label}`);
  console.log('='.repeat(90));
  console.log(
    pad('#', 4) + pad('SL Ticks', 10) + pad('Retries', 9) + pad('Bins', 6) +
    pad('Trades', 8) + pad('W/L', 8) + pad('Win%', 8) + pad('Net P&L', 12) +
    pad('Avg P&L', 10) + pad('PF', 8) + pad('Sharpe', 8) + pad('MaxDD', 10)
  );
  console.log('-'.repeat(90));

  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    const slLabel = r.config.slBufferTicks === 0 ? 'mirror' : String(r.config.slBufferTicks);
    console.log(
      pad(String(i + 1), 4) +
      pad(slLabel, 10) +
      pad(String(r.config.maxRetries), 9) +
      pad(String(r.config.numBins), 6) +
      pad(String(r.tradesTaken), 8) +
      pad(`${r.wins}/${r.losses}`, 8) +
      pad(`${r.winRate.toFixed(1)}%`, 8) +
      pad(fmtPnl(r.totalNetPnl), 12) +
      pad(fmtPnl(r.avgNetPnl), 10) +
      pad(r.profitFactor === Infinity ? 'Inf' : r.profitFactor.toFixed(2), 8) +
      pad(r.sharpeRatio.toFixed(2), 8) +
      pad(fmtPnl(-r.maxDrawdown), 10)
    );
  }
}

function printBestConfig(label: string, result: OptResult): void {
  console.log('\n' + '*'.repeat(70));
  console.log(`  OPTIMAL CONFIG — ${label}`);
  console.log('*'.repeat(70));
  const slLabel = result.config.slBufferTicks === 0 ? 'mirrored TP1 distance' : `${result.config.slBufferTicks}-tick buffer`;
  console.log(`  SL Method:       ${slLabel}`);
  console.log(`  Max Retries:     ${result.config.maxRetries}`);
  console.log(`  VPVR Bins:       ${result.config.numBins}`);
  console.log('');
  console.log(`  Trades Taken:    ${result.tradesTaken}`);
  console.log(`  Wins / Losses:   ${result.wins} / ${result.losses}`);
  console.log(`  Win Rate:        ${result.winRate.toFixed(1)}%`);
  console.log(`  Total Net P&L:   ${fmtPnl(result.totalNetPnl)}`);
  console.log(`  Avg Net P&L:     ${fmtPnl(result.avgNetPnl)}`);
  console.log(`  Profit Factor:   ${result.profitFactor === Infinity ? 'Inf' : result.profitFactor.toFixed(2)}`);
  console.log(`  Sharpe Ratio:    ${result.sharpeRatio.toFixed(2)}`);
  console.log(`  Max Drawdown:    ${fmtPnl(-result.maxDrawdown)}`);
  console.log('');

  // Per-trade breakdown
  const filled = result.trades.filter(t => t.entryFilled);
  if (filled.length > 0) {
    console.log('  --- Trade Breakdown ---');
    console.log(
      '  ' + pad('#', 4) + pad('Symbol', 8) + pad('Side', 6) + pad('Entry', 12) +
      pad('Exit', 12) + pad('P&L', 12) + pad('Reason', 24) + pad('TP Hit', 8) + 'Retry'
    );
    console.log('  ' + '-'.repeat(86));
    for (let i = 0; i < filled.length; i++) {
      const t = filled[i];
      console.log(
        '  ' + pad(String(i + 1), 4) +
        pad(t.symbol, 8) +
        pad(t.side.toUpperCase(), 6) +
        pad(t.entryPrice.toFixed(2), 12) +
        pad(t.exitPrice.toFixed(2), 12) +
        pad(fmtPnl(t.netPnl), 12) +
        pad(t.exitReason, 24) +
        pad(t.highestTpHit ?? '-', 8) +
        String(t.retryCount)
      );
    }
  }
  console.log('*'.repeat(70));
}

function fmtPnl(v: number): string {
  return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n========================================================');
  console.log('  ML-OPTIMIZED BACKTEST — TopstepX Bot 5.0');
  console.log('  Using 1-minute real API data');
  console.log('========================================================\n');

  // Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Authenticate with TopstepX
  console.log('[1/5] Authenticating with TopstepX API...');
  const authOk = await authenticate();
  if (!authOk) {
    console.error('Failed to authenticate with TopstepX API');
    process.exit(1);
  }
  console.log('  Authenticated successfully.\n');

  // Fetch all alerts
  console.log('[2/5] Fetching alerts from Supabase...');
  const allAlerts = await fetchAlerts(supabase);
  console.log(`  Found ${allAlerts.length} buy/sell alerts total`);

  const strategy1 = 'day-trader-medium-term-13';
  const strategy2 = 'day-trader-long-term-AI';
  const alerts1 = allAlerts.filter(a => a.name === strategy1);
  const alerts2 = allAlerts.filter(a => a.name === strategy2);
  console.log(`  Strategy "${strategy1}": ${alerts1.length} alerts`);
  console.log(`  Strategy "${strategy2}": ${alerts2.length} alerts\n`);

  // Fetch 1M bars for all alerts
  console.log('[3/5] Fetching 1-minute bars from TopstepX API...');
  const alertBarsMap = new Map<string, Bar[]>();
  let fetched = 0;
  let skipped = 0;

  for (const alert of allAlerts) {
    const bars = await fetchBarsForAlert(alert);
    if (bars.length > 0) {
      alertBarsMap.set(alert.id, bars);
      fetched++;
      console.log(`  [${fetched}/${allAlerts.length}] ${alert.symbol} ${alert.action} — ${bars.length} bars`);
    } else {
      skipped++;
      console.log(`  [SKIP] ${alert.symbol} ${alert.action} — no bars available`);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`  Fetched bars for ${fetched} alerts (skipped ${skipped})\n`);

  // Build alert+bars pairs per strategy
  const buildPairs = (alerts: AlertData[]) =>
    alerts
      .filter(a => alertBarsMap.has(a.id))
      .map(a => ({ alert: a, bars: alertBarsMap.get(a.id)! }));

  const pairs1 = buildPairs(alerts1);
  const pairs2 = buildPairs(alerts2);
  const pairsAll = buildPairs(allAlerts);

  console.log(`  Strategy 1 pairs: ${pairs1.length}`);
  console.log(`  Strategy 2 pairs: ${pairs2.length}`);
  console.log(`  Combined pairs: ${pairsAll.length}\n`);

  // ─── Phase 1: Coarse Grid Search ─────────────────────────────────────────
  console.log('[4/5] Running coarse grid search optimization...');

  const coarseSl = [0, 2, 4, 6, 8, 10, 12, 16, 20];
  const coarseRetries = [0, 1, 2, 3];
  const coarseBins = [20, 30, 40, 50, 60, 80, 100];
  const coarseGrid = generateGrid(coarseSl, coarseRetries, coarseBins);
  console.log(`  Coarse grid: ${coarseGrid.length} combinations`);

  // Run for each strategy + combined
  const runGrid = (pairs: Array<{ alert: AlertData; bars: Bar[] }>, configs: ConfigParams[]): OptResult[] => {
    return configs.map(cfg => runOptBacktest(pairs, cfg));
  };

  console.log('\n  Running Strategy 1...');
  const results1Coarse = runGrid(pairs1, coarseGrid);
  const best1Coarse = results1Coarse.sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];
  console.log(`    Best coarse P&L: ${fmtPnl(best1Coarse.totalNetPnl)} (SL=${best1Coarse.config.slBufferTicks}, retries=${best1Coarse.config.maxRetries}, bins=${best1Coarse.config.numBins})`);

  console.log('  Running Strategy 2...');
  const results2Coarse = runGrid(pairs2, coarseGrid);
  const best2Coarse = results2Coarse.sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];
  console.log(`    Best coarse P&L: ${fmtPnl(best2Coarse.totalNetPnl)} (SL=${best2Coarse.config.slBufferTicks}, retries=${best2Coarse.config.maxRetries}, bins=${best2Coarse.config.numBins})`);

  console.log('  Running Combined...');
  const resultsAllCoarse = runGrid(pairsAll, coarseGrid);
  const bestAllCoarse = resultsAllCoarse.sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];
  console.log(`    Best coarse P&L: ${fmtPnl(bestAllCoarse.totalNetPnl)} (SL=${bestAllCoarse.config.slBufferTicks}, retries=${bestAllCoarse.config.maxRetries}, bins=${bestAllCoarse.config.numBins})`);

  // ─── Phase 2: Fine-Grained Refinement ────────────────────────────────────
  console.log('\n[5/5] Running fine-grained refinement around best configs...');

  const refineAround = (best: ConfigParams): ConfigParams[] => {
    const slCenter = best.slBufferTicks;
    const retryCenter = best.maxRetries;
    const binsCenter = best.numBins;

    const slRange = [...new Set([
      Math.max(0, slCenter - 3), Math.max(0, slCenter - 2), Math.max(0, slCenter - 1),
      slCenter,
      slCenter + 1, slCenter + 2, slCenter + 3,
    ])].sort((a, b) => a - b);

    const retryRange = [...new Set([
      Math.max(0, retryCenter - 1), retryCenter, Math.min(5, retryCenter + 1),
    ])].sort((a, b) => a - b);

    const binsRange = [...new Set([
      Math.max(10, binsCenter - 15), Math.max(10, binsCenter - 10), Math.max(10, binsCenter - 5),
      binsCenter,
      binsCenter + 5, binsCenter + 10, binsCenter + 15,
    ])].sort((a, b) => a - b);

    return generateGrid(slRange, retryRange, binsRange);
  };

  console.log('  Refining Strategy 1...');
  const fineGrid1 = refineAround(best1Coarse.config);
  console.log(`    Fine grid: ${fineGrid1.length} combinations`);
  const results1Fine = runGrid(pairs1, fineGrid1);
  const best1Final = [...results1Coarse, ...results1Fine].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];

  console.log('  Refining Strategy 2...');
  const fineGrid2 = refineAround(best2Coarse.config);
  console.log(`    Fine grid: ${fineGrid2.length} combinations`);
  const results2Fine = runGrid(pairs2, fineGrid2);
  const best2Final = [...results2Coarse, ...results2Fine].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];

  console.log('  Refining Combined...');
  const fineGridAll = refineAround(bestAllCoarse.config);
  console.log(`    Fine grid: ${fineGridAll.length} combinations`);
  const resultsAllFine = runGrid(pairsAll, fineGridAll);
  const bestAllFinal = [...resultsAllCoarse, ...resultsAllFine].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];

  // ─── Phase 3: Ultra-Fine Refinement (1-tick SL granularity) ──────────────
  console.log('\n  Ultra-fine refinement (1-tick SL granularity)...');

  const ultraRefine = (best: ConfigParams): ConfigParams[] => {
    const sl = best.slBufferTicks;
    const slRange = [...new Set(
      Array.from({ length: 7 }, (_, i) => Math.max(0, sl - 3 + i))
    )];
    const binsCenter = best.numBins;
    const binsRange = [...new Set([
      Math.max(10, binsCenter - 3), Math.max(10, binsCenter - 2), Math.max(10, binsCenter - 1),
      binsCenter, binsCenter + 1, binsCenter + 2, binsCenter + 3,
    ])];
    return generateGrid(slRange, [best.maxRetries], binsRange);
  };

  const ultra1 = runGrid(pairs1, ultraRefine(best1Final.config));
  const ultra2 = runGrid(pairs2, ultraRefine(best2Final.config));
  const ultraAll = runGrid(pairsAll, ultraRefine(bestAllFinal.config));

  const final1 = [...results1Coarse, ...results1Fine, ...ultra1].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];
  const final2 = [...results2Coarse, ...results2Fine, ...ultra2].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];
  const finalAll = [...resultsAllCoarse, ...resultsAllFine, ...ultraAll].sort((a, b) => b.totalNetPnl - a.totalNetPnl)[0];

  // ─── Report ───────────────────────────────────────────────────────────────

  const totalConfigs = coarseGrid.length * 3 + fineGrid1.length + fineGrid2.length + fineGridAll.length +
    ultraRefine(best1Final.config).length + ultraRefine(best2Final.config).length + ultraRefine(bestAllFinal.config).length;

  console.log(`\n  Optimization complete! Tested ${totalConfigs} total configurations.\n`);

  // Top 10 tables
  printResults(`Strategy: ${strategy1}`, [...results1Coarse, ...results1Fine, ...ultra1]);
  printResults(`Strategy: ${strategy2}`, [...results2Coarse, ...results2Fine, ...ultra2]);
  printResults('Combined (Both Strategies)', [...resultsAllCoarse, ...resultsAllFine, ...ultraAll]);

  // Best configs
  printBestConfig(`Strategy: ${strategy1}`, final1);
  printBestConfig(`Strategy: ${strategy2}`, final2);
  printBestConfig('Combined (Both Strategies)', finalAll);

  // Summary comparison
  console.log('\n' + '='.repeat(70));
  console.log('  FINAL RECOMMENDATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  Strategy: ${strategy1}
    SL: ${final1.config.slBufferTicks === 0 ? 'mirrored TP1' : final1.config.slBufferTicks + ' ticks'}  |  Retries: ${final1.config.maxRetries}  |  Bins: ${final1.config.numBins}
    Net P&L: ${fmtPnl(final1.totalNetPnl)}  |  Win Rate: ${final1.winRate.toFixed(1)}%  |  PF: ${final1.profitFactor === Infinity ? 'Inf' : final1.profitFactor.toFixed(2)}  |  Sharpe: ${final1.sharpeRatio.toFixed(2)}

  Strategy: ${strategy2}
    SL: ${final2.config.slBufferTicks === 0 ? 'mirrored TP1' : final2.config.slBufferTicks + ' ticks'}  |  Retries: ${final2.config.maxRetries}  |  Bins: ${final2.config.numBins}
    Net P&L: ${fmtPnl(final2.totalNetPnl)}  |  Win Rate: ${final2.winRate.toFixed(1)}%  |  PF: ${final2.profitFactor === Infinity ? 'Inf' : final2.profitFactor.toFixed(2)}  |  Sharpe: ${final2.sharpeRatio.toFixed(2)}

  Combined (Both):
    SL: ${finalAll.config.slBufferTicks === 0 ? 'mirrored TP1' : finalAll.config.slBufferTicks + ' ticks'}  |  Retries: ${finalAll.config.maxRetries}  |  Bins: ${finalAll.config.numBins}
    Net P&L: ${fmtPnl(finalAll.totalNetPnl)}  |  Win Rate: ${finalAll.winRate.toFixed(1)}%  |  PF: ${finalAll.profitFactor === Infinity ? 'Inf' : finalAll.profitFactor.toFixed(2)}  |  Sharpe: ${finalAll.sharpeRatio.toFixed(2)}
  `);
  console.log('='.repeat(70));
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
