// Backtest engine — orchestrates alert fetch, VPVR calculation, and trade simulation

import { logger } from '../../lib/logger';
import { getSupabase } from '../../lib/supabase';
import { getHistoricalBars, getCurrentContractId } from '../../services/topstepx/client';
import { BarUnit } from '../../services/topstepx/types';
import type { Bar } from '../../services/topstepx/types';
import type { AlertRow } from '../../types/database';
import { calculateVpvr } from '../../services/vpvr/calculator';
import { simulateBatch } from './simulator';
import type { BacktestConfig, BacktestResult, SimulatedTrade } from './types';

/**
 * Run a backtest over stored alerts within a date range.
 *
 * 1. Fetch alerts from Supabase (filtered by date range + symbol)
 * 2. For each buy/sell alert, fetch historical 5M bars at that timestamp
 * 3. Calculate VPVR, run simulateTrade()
 * 4. Aggregate results: win rate, P&L, profit factor, Sharpe, max drawdown
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const supabase = getSupabase();

  logger.info('Backtest starting', {
    symbols: config.symbols,
    from: config.fromDate,
    to: config.toDate,
  });

  // Fetch alerts from Supabase (filter by symbols array)
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*')
    .in('symbol', config.symbols)
    .gte('created_at', config.fromDate)
    .lte('created_at', config.toDate)
    .in('action', ['buy', 'sell'])
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to fetch alerts for backtest', { error: error.message });
    throw new Error(`Failed to fetch alerts: ${error.message}`);
  }

  const alertRows = (alerts ?? []) as AlertRow[];
  logger.info(`Fetched ${alertRows.length} alerts for backtest`);

  // Pre-resolve contract IDs per symbol
  const contractIdMap = new Map<string, string>();
  for (const sym of config.symbols) {
    contractIdMap.set(sym, getCurrentContractId(sym));
  }

  // Collect alert data (bars + VPVR) for batch simulation
  const alertsWithData: Array<{ alert: AlertRow; bars: Bar[]; vpvr: ReturnType<typeof calculateVpvr> & object }> = [];

  for (const alert of alertRows) {
    try {
      const contractId = contractIdMap.get(alert.symbol) ?? getCurrentContractId(alert.symbol);

      // Fetch 5M bars around the alert timestamp (60 bars = 5 hours)
      const alertTime = new Date(alert.created_at);
      const startTime = new Date(alertTime.getTime() - 30 * 5 * 60 * 1000); // 30 bars before
      const endTime = new Date(alertTime.getTime() + 30 * 5 * 60 * 1000); // 30 bars after

      const bars: Bar[] = await getHistoricalBars({
        contractId,
        live: false,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        unit: BarUnit.MINUTE,
        unitNumber: 5,
      });

      if (bars.length === 0) {
        logger.warn('No bars available for alert', { alertId: alert.id });
        continue;
      }

      // Calculate VPVR from bars
      const vpvr = calculateVpvr(bars);
      if (!vpvr) {
        logger.warn('VPVR calculation returned null', { alertId: alert.id });
        continue;
      }

      alertsWithData.push({ alert, bars, vpvr });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.warn('Failed to prepare alert for simulation', { alertId: alert.id, error: msg });
    }
  }

  // Run capacity-aware batch simulation
  const batchResult = simulateBatch(alertsWithData, {
    quantity: config.quantity,
    maxContracts: config.maxContracts,
    maxRetries: config.maxRetries,
    slBufferTicks: config.slBufferTicks,
  });

  // Aggregate results with capacity stats
  return aggregateResults(config, alertRows.length, batchResult.trades, batchResult.alertsSkipped, batchResult.capacityExceeded);
}

/** Aggregate simulated trades into a BacktestResult */
export function aggregateResults(
  config: BacktestConfig,
  alertsEvaluated: number,
  trades: SimulatedTrade[],
  alertsSkipped = 0,
  capacityExceeded = 0,
): BacktestResult {
  const filledTrades = trades.filter((t) => t.entryFilled);
  const wins = filledTrades.filter((t) => t.netPnl > 0);
  const losses = filledTrades.filter((t) => t.netPnl <= 0);

  const totalGrossPnl = filledTrades.reduce((sum, t) => sum + t.grossPnl, 0);
  const totalNetPnl = filledTrades.reduce((sum, t) => sum + t.netPnl, 0);
  const avgNetPnl = filledTrades.length > 0 ? totalNetPnl / filledTrades.length : 0;

  // Profit factor: gross wins / gross losses
  const grossWins = wins.reduce((sum, t) => sum + t.grossPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.grossPnl, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  // Sharpe ratio (annualized, assuming 252 trading days)
  const sharpeRatio = calculateSharpe(filledTrades.map((t) => t.netPnl));

  // Max drawdown
  const maxDrawdown = calculateMaxDrawdown(filledTrades.map((t) => t.netPnl));

  return {
    config,
    alertsEvaluated,
    tradesTaken: filledTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: filledTrades.length > 0 ? (wins.length / filledTrades.length) * 100 : 0,
    totalGrossPnl,
    totalNetPnl,
    avgNetPnl,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    trades,
    alertsSkipped,
    capacityExceeded,
  };
}

/** Calculate annualized Sharpe ratio from an array of P&L values */
function calculateSharpe(pnls: number[]): number {
  if (pnls.length < 2) return 0;

  const mean = pnls.reduce((sum, p) => sum + p, 0) / pnls.length;
  const variance = pnls.reduce((sum, p) => sum + (p - mean) ** 2, 0) / (pnls.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize: assume ~252 trading days
  return (mean / stdDev) * Math.sqrt(252);
}

/** Calculate maximum peak-to-trough drawdown from cumulative P&L */
function calculateMaxDrawdown(pnls: number[]): number {
  if (pnls.length === 0) return 0;

  let peak = 0;
  let maxDD = 0;
  let cumulative = 0;

  for (const pnl of pnls) {
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    if (drawdown > maxDD) {
      maxDD = drawdown;
    }
  }

  return maxDD;
}
