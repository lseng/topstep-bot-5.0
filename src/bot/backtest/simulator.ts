// Backtest simulator — pure trade simulation, no I/O

import type { AlertRow } from '../../types/database';
import type { Bar } from '../../services/topstepx/types';
import type { VpvrResult } from '../../services/vpvr/types';
import type { SimulatedTrade } from './types';
import type { ManagedPosition, PositionSide, PositionState } from '../types';
import { calculateEntryPrice } from '../entry-calculator';
import { evaluateTrailingStop } from '../trailing-stop';
import { CONTRACT_SPECS } from '../../services/topstepx/types';

/** Simulator config */
export interface SimulatorConfig {
  /** Number of ticks for SL buffer (default: 8) */
  slBufferTicks: number;
  /** Number of contracts per trade (default: 1) */
  quantity: number;
  /** Symbol for tick size lookup (default: 'ES') */
  symbol: string;
}

const DEFAULT_CONFIG: SimulatorConfig = {
  slBufferTicks: 8,
  quantity: 1,
  symbol: 'ES',
};

/**
 * Simulate a single trade from an alert + historical bars + VPVR result.
 *
 * 1. Calculate entry price from VPVR (VAL for buy, VAH for sell)
 * 2. Walk forward through bars to find entry fill
 * 3. Once filled, walk remaining bars checking TP/SL progression
 * 4. Return full trade lifecycle or null if no entry/fill
 *
 * @param alert - The alert that triggered this trade
 * @param bars - Historical 5M bars starting from alert time
 * @param vpvrResult - Pre-calculated VPVR result
 * @param config - Simulation configuration
 * @returns Simulated trade or null if close action or entry never fills
 */
export function simulateTrade(
  alert: AlertRow,
  bars: Bar[],
  vpvrResult: VpvrResult,
  config?: Partial<SimulatorConfig>,
): SimulatedTrade | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate entry levels
  const entry = calculateEntryPrice(alert.action, vpvrResult, {
    slBufferTicks: cfg.slBufferTicks,
    symbol: cfg.symbol,
  });

  // Close actions have no entry
  if (!entry) return null;

  const side: PositionSide = alert.action === 'buy' ? 'long' : 'short';
  const isLong = side === 'long';

  // Walk bars to find entry fill
  let fillBarIndex = -1;
  let fillPrice = entry.entryPrice;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    // Long: bar low reaches entry (VAL)
    // Short: bar high reaches entry (VAH)
    const filled = isLong ? bar.l <= entry.entryPrice : bar.h >= entry.entryPrice;

    if (filled) {
      fillBarIndex = i;
      fillPrice = entry.entryPrice;
      break;
    }
  }

  // Entry never fills
  if (fillBarIndex === -1) {
    return {
      alertId: alert.id,
      symbol: alert.symbol,
      side,
      entryPrice: entry.entryPrice,
      entryTime: new Date(alert.created_at),
      exitPrice: 0,
      exitTime: new Date(alert.created_at),
      exitReason: 'entry_never_filled',
      highestTpHit: null,
      tpProgression: [],
      grossPnl: 0,
      netPnl: 0,
      vpvrPoc: vpvrResult.poc,
      vpvrVah: vpvrResult.vah,
      vpvrVal: vpvrResult.val,
      entryFilled: false,
    };
  }

  // Build a minimal ManagedPosition for trailing stop evaluation
  const position: ManagedPosition = {
    id: `sim-${alert.id}`,
    alertId: alert.id,
    symbol: alert.symbol,
    side,
    state: 'active' as PositionState,
    entryPrice: fillPrice,
    targetEntryPrice: entry.entryPrice,
    quantity: cfg.quantity,
    contractId: '',
    accountId: 0,
    currentSl: entry.initialSl,
    initialSl: entry.initialSl,
    tp1Price: entry.tp1,
    tp2Price: entry.tp2,
    tp3Price: entry.tp3,
    unrealizedPnl: 0,
    vpvrData: vpvrResult,
    createdAt: new Date(bars[fillBarIndex].t),
    updatedAt: new Date(bars[fillBarIndex].t),
    dirty: false,
  };

  const tpProgression: string[] = [];
  let highestTpHit: string | null = null;

  // Walk remaining bars for TP/SL progression
  for (let i = fillBarIndex; i < bars.length; i++) {
    const bar = bars[i];

    // Simulate bar with high and low to check both extremes
    // Check unfavorable direction first (SL), then favorable (TP)
    const pricesToCheck = isLong
      ? [bar.l, bar.h] // Long: check low (SL) then high (TP)
      : [bar.h, bar.l]; // Short: check high (SL) then low (TP)

    for (const price of pricesToCheck) {
      const result = evaluateTrailingStop(position, price);

      if (result.shouldClose) {
        // Position closed
        const exitPrice = position.currentSl; // Exit at SL level
        const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, cfg.symbol);

        return {
          alertId: alert.id,
          symbol: alert.symbol,
          side,
          entryPrice: fillPrice,
          entryTime: new Date(bars[fillBarIndex].t),
          exitPrice,
          exitTime: new Date(bar.t),
          exitReason: result.closeReason ?? 'sl_hit',
          highestTpHit,
          tpProgression,
          grossPnl: pnl,
          netPnl: pnl, // No fees in simulation
          vpvrPoc: vpvrResult.poc,
          vpvrVah: vpvrResult.vah,
          vpvrVal: vpvrResult.val,
          entryFilled: true,
        };
      }

      if (result.newState) {
        position.state = result.newState;
        position.updatedAt = new Date(bar.t);

        if (result.newSl != null) {
          position.currentSl = result.newSl;
        }

        // Track TP progression
        if (result.newState === 'tp1_hit') {
          tpProgression.push('tp1');
          highestTpHit = 'tp1';
        } else if (result.newState === 'tp2_hit') {
          tpProgression.push('tp2');
          highestTpHit = 'tp2';
        } else if (result.newState === 'tp3_hit') {
          tpProgression.push('tp3');
          highestTpHit = 'tp3';
        }
      }
    }
  }

  // Position still open at end of bars — close at last bar close
  const lastBar = bars[bars.length - 1];
  const exitPrice = lastBar.c;
  const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, cfg.symbol);

  return {
    alertId: alert.id,
    symbol: alert.symbol,
    side,
    entryPrice: fillPrice,
    entryTime: new Date(bars[fillBarIndex].t),
    exitPrice,
    exitTime: new Date(lastBar.t),
    exitReason: 'bars_exhausted',
    highestTpHit,
    tpProgression,
    grossPnl: pnl,
    netPnl: pnl,
    vpvrPoc: vpvrResult.poc,
    vpvrVah: vpvrResult.vah,
    vpvrVal: vpvrResult.val,
    entryFilled: true,
  };
}

/** Calculate P&L for a trade using contract point value */
function calculatePnl(
  side: PositionSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  symbol: string,
): number {
  const pointValue = CONTRACT_SPECS[symbol]?.pointValue ?? 50; // Default ES
  const priceDiff = side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return priceDiff * pointValue * quantity;
}
