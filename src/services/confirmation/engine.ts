// Confirmation engine — fetches bars, runs VPVR, scores signal

import { logger } from '../../lib/logger';
import { getHistoricalBars, getCurrentContractId } from '../topstepx/client';
import { BarUnit } from '../topstepx/types';
import type { Bar } from '../topstepx/types';
import type { TradeAction } from '../../types';
import { calculateVpvr } from '../vpvr/calculator';
import type { VpvrResult } from '../vpvr/types';
import type {
  ConfirmationConfig,
  ConfirmationLevel,
  ConfirmationResult,
  TimeframeResult,
} from './types';

/** Default confirmation configuration */
export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  bars1M: 60,
  bars5M: 60,
  numBins: 50,
  minScore: 50,
};

/**
 * Fetch recent bars from TopstepX API for a given timeframe.
 */
export async function fetchBars(
  symbol: string,
  unitNumber: number,
  barCount: number,
): Promise<Bar[]> {
  const contractId = getCurrentContractId(symbol);
  const now = new Date();
  const startTime = new Date(now.getTime() - barCount * unitNumber * 60 * 1000);

  return getHistoricalBars({
    contractId,
    live: true,
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    unit: BarUnit.MINUTE,
    unitNumber,
    limit: barCount,
  });
}

/**
 * Evaluate where price sits relative to VPVR value area for a given action.
 *
 * BUY:  price <= VAL → strong, <= POC → moderate, < VAH → weak, >= VAH → reject
 * SELL: price >= VAH → strong, >= POC → moderate, > VAL → weak, <= VAL → reject
 * Close actions always return strong.
 */
export function evaluateLevel(
  action: TradeAction,
  price: number,
  vpvr: VpvrResult,
): { level: ConfirmationLevel; reason: string } {
  if (action === 'close' || action === 'close_long' || action === 'close_short') {
    return { level: 'strong', reason: 'Close actions bypass VPVR confirmation' };
  }

  if (action === 'buy') {
    if (price <= vpvr.val) {
      return { level: 'strong', reason: `Price ${price} at/below VAL ${vpvr.val.toFixed(2)} (discount zone)` };
    }
    if (price <= vpvr.poc) {
      return { level: 'moderate', reason: `Price ${price} between VAL and POC ${vpvr.poc.toFixed(2)} (fair value)` };
    }
    if (price < vpvr.vah) {
      return { level: 'weak', reason: `Price ${price} between POC and VAH ${vpvr.vah.toFixed(2)} (trending premium)` };
    }
    return { level: 'reject', reason: `Price ${price} at/above VAH ${vpvr.vah.toFixed(2)} (premium zone — don't buy high)` };
  }

  // action === 'sell'
  if (price >= vpvr.vah) {
    return { level: 'strong', reason: `Price ${price} at/above VAH ${vpvr.vah.toFixed(2)} (premium zone)` };
  }
  if (price >= vpvr.poc) {
    return { level: 'moderate', reason: `Price ${price} between POC and VAH ${vpvr.vah.toFixed(2)} (fair value)` };
  }
  if (price > vpvr.val) {
    return { level: 'weak', reason: `Price ${price} between VAL ${vpvr.val.toFixed(2)} and POC (trending discount)` };
  }
  return { level: 'reject', reason: `Price ${price} at/below VAL ${vpvr.val.toFixed(2)} (discount zone — don't sell low)` };
}

/** Numeric weight for each confirmation level */
const LEVEL_WEIGHT: Record<ConfirmationLevel, number> = {
  strong: 100,
  moderate: 70,
  weak: 30,
  reject: 0,
};

/**
 * Compute a composite score (0-100) from two timeframe results.
 * 1M is weighted 40%, 5M is weighted 60% (broader context matters more).
 */
export function computeScore(
  tf1: TimeframeResult,
  tf5: TimeframeResult,
): number {
  const w1 = LEVEL_WEIGHT[tf1.level];
  const w5 = LEVEL_WEIGHT[tf5.level];
  return Math.round(w1 * 0.4 + w5 * 0.6);
}

/** Map a numeric score to a confirmation level */
function scoreToLevel(score: number): ConfirmationLevel {
  if (score >= 85) return 'strong';
  if (score >= 60) return 'moderate';
  if (score >= 30) return 'weak';
  return 'reject';
}

/**
 * Run full VPVR confirmation for a webhook alert.
 *
 * 1. Fetch 1M and 5M bars in parallel
 * 2. Calculate VPVR on each
 * 3. Evaluate price position
 * 4. Compute composite score
 */
export async function confirmAlert(
  symbol: string,
  action: TradeAction,
  price: number,
  config?: Partial<ConfirmationConfig>,
): Promise<ConfirmationResult> {
  const cfg = { ...DEFAULT_CONFIRMATION_CONFIG, ...config };
  const timestamp = new Date().toISOString();

  // Close actions always confirmed
  if (action === 'close' || action === 'close_long' || action === 'close_short') {
    return {
      confirmed: true,
      score: 100,
      level: 'strong',
      timeframes: [],
      summary: 'Close actions bypass VPVR confirmation',
      action,
      price,
      timestamp,
    };
  }

  // Fetch bars in parallel
  const [bars1M, bars5M] = await Promise.all([
    fetchBars(symbol, 1, cfg.bars1M).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.warn('Failed to fetch 1M bars', { error: msg });
      return [] as Bar[];
    }),
    fetchBars(symbol, 5, cfg.bars5M).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.warn('Failed to fetch 5M bars', { error: msg });
      return [] as Bar[];
    }),
  ]);

  // Calculate VPVR
  const vpvr1M = calculateVpvr(bars1M, { numBins: cfg.numBins });
  const vpvr5M = calculateVpvr(bars5M, { numBins: cfg.numBins });

  // If both fail, return reject
  if (!vpvr1M && !vpvr5M) {
    return {
      confirmed: false,
      score: 0,
      level: 'reject',
      timeframes: [],
      summary: 'No bar data available for VPVR calculation',
      action,
      price,
      timestamp,
    };
  }

  const timeframes: TimeframeResult[] = [];

  // Evaluate each available timeframe
  let tf1Result: TimeframeResult | null = null;
  let tf5Result: TimeframeResult | null = null;

  if (vpvr1M) {
    const { level, reason } = evaluateLevel(action, price, vpvr1M);
    tf1Result = { timeframe: '1M', vpvr: vpvr1M, level, reason };
    timeframes.push(tf1Result);
  }

  if (vpvr5M) {
    const { level, reason } = evaluateLevel(action, price, vpvr5M);
    tf5Result = { timeframe: '5M', vpvr: vpvr5M, level, reason };
    timeframes.push(tf5Result);
  }

  // Compute score
  let score: number;
  if (tf1Result && tf5Result) {
    score = computeScore(tf1Result, tf5Result);
  } else {
    // Only one timeframe available — use it directly with a 20% penalty
    const single = tf1Result ?? tf5Result!;
    score = Math.round(LEVEL_WEIGHT[single.level] * 0.8);
  }

  const level = scoreToLevel(score);
  const confirmed = score >= cfg.minScore;

  const tfSummaries = timeframes
    .map((tf) => `${tf.timeframe}: ${tf.level} — ${tf.reason}`)
    .join(' | ');

  const summary = `${action.toUpperCase()} @ ${price} → score ${score}/100 (${level}) | ${tfSummaries}`;

  logger.info('VPVR confirmation', {
    symbol,
    action,
    price,
    score,
    level,
    confirmed,
  });

  return {
    confirmed,
    score,
    level,
    timeframes,
    summary,
    action,
    price,
    timestamp,
  };
}
