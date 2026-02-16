// Backtest simulator — pure trade simulation, no I/O

import type { AlertRow } from '../../types/database';
import type { Bar } from '../../services/topstepx/types';
import type { VpvrResult } from '../../services/vpvr/types';
import type { SimulatedTrade } from './types';
import type { ManagedPosition, PositionSide, PositionState } from '../types';
import { calculateEntryPrice, calculateRetryEntryLevels, calculateSlFromEntry } from '../entry-calculator';
import { evaluateTrailingStop } from '../trailing-stop';
import { CONTRACT_SPECS, getMicroEquivalent } from '../../services/topstepx/types';

/** Simulator config */
export interface SimulatorConfig {
  /** Number of contracts per trade (default: 1) */
  quantity: number;
  /** Symbol for tick size lookup (default: 'ES') */
  symbol: string;
  /** Maximum contracts in micro-equivalent units (default: 0 = unlimited) */
  maxContracts: number;
  /** Maximum re-entry attempts per signal after SL hit (default: 0 = no retries) */
  maxRetries: number;
  /** Fixed stop-loss buffer in ticks (default: 0 = use mirrored TP1) */
  slBufferTicks: number;
}

const DEFAULT_CONFIG: SimulatorConfig = {
  quantity: 1,
  symbol: 'ES',
  maxContracts: 0,
  maxRetries: 0,
  slBufferTicks: 0,
};

/**
 * Result of capacity-aware batch simulation.
 * Wraps trades plus capacity-exceeded stats.
 */
export interface BatchSimulationResult {
  trades: SimulatedTrade[];
  alertsSkipped: number;
  capacityExceeded: number;
}

/**
 * Simulate multiple trades sequentially with position capacity tracking.
 * Tracks concurrent open positions and enforces maxContracts limit.
 *
 * Each trade is simulated independently; concurrent positions are tracked
 * by checking if a prior trade's exit time is after the new alert's time.
 *
 * @param alertsWithData - Array of { alert, bars, vpvr } tuples
 * @param config - Simulation configuration including maxContracts
 * @returns BatchSimulationResult with trades, alertsSkipped, capacityExceeded
 */
export function simulateBatch(
  alertsWithData: Array<{ alert: AlertRow; bars: Bar[]; vpvr: VpvrResult }>,
  config?: Partial<SimulatorConfig>,
): BatchSimulationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const trades: SimulatedTrade[] = [];
  let alertsSkipped = 0;
  let capacityExceeded = 0;

  for (const { alert, bars, vpvr } of alertsWithData) {
    // Check capacity if maxContracts > 0
    if (cfg.maxContracts > 0) {
      const alertTime = new Date(alert.created_at).getTime();
      // Count micro-equivalent units of concurrently open positions
      let currentMicro = 0;
      for (const t of trades) {
        if (t.entryFilled && t.exitTime.getTime() > alertTime) {
          currentMicro += getMicroEquivalent(t.symbol, cfg.quantity);
        }
      }

      const requiredMicro = getMicroEquivalent(alert.symbol, cfg.quantity);
      if (currentMicro + requiredMicro > cfg.maxContracts) {
        alertsSkipped++;
        capacityExceeded++;
        continue;
      }
    }

    const trade = simulateTrade(alert, bars, vpvr, {
      quantity: cfg.quantity,
      symbol: alert.symbol,
      maxContracts: cfg.maxContracts,
      maxRetries: cfg.maxRetries,
      slBufferTicks: cfg.slBufferTicks,
    });

    if (trade) {
      trades.push(trade);

      // If retries are enabled, simulate re-entries after SL from active
      if (cfg.maxRetries > 0 && trade.entryFilled && isSlHitFromActive(trade.exitReason)) {
        const retryTrades = simulateRetries(
          alert, bars, vpvr, trade, cfg,
        );
        trades.push(...retryTrades);
      }
    }
  }

  return { trades, alertsSkipped, capacityExceeded };
}

/** Check if exit reason indicates SL hit from active (no TP reached) */
function isSlHitFromActive(exitReason: string): boolean {
  return exitReason === 'sl_hit_from_active';
}

/**
 * Simulate retry entries after an initial SL hit from active state.
 *
 * For each retry, scan remaining bars for fill at either the stepped level
 * or the fallback (original) level. Whichever fills first becomes the new entry.
 *
 * @returns Array of SimulatedTrade for each retry attempt
 */
function simulateRetries(
  alert: AlertRow,
  bars: Bar[],
  vpvr: VpvrResult,
  previousTrade: SimulatedTrade,
  cfg: SimulatorConfig,
): SimulatedTrade[] {
  const retryTrades: SimulatedTrade[] = [];
  const side: PositionSide = alert.action === 'buy' ? 'long' : 'short';
  const isLong = side === 'long';
  const retryLevels = calculateRetryEntryLevels(side, vpvr, cfg.maxRetries);
  const originalLevel = retryLevels[0]; // VAL or VAH

  let lastExitTime = previousTrade.exitTime;
  let lastExitReason = previousTrade.exitReason;

  for (let retry = 1; retry <= cfg.maxRetries; retry++) {
    // Only retry if previous exit was SL from active
    if (!isSlHitFromActive(lastExitReason)) break;

    const steppedLevel = retryLevels[retry] ?? originalLevel;

    // Find the bar index where the last trade exited
    const exitTimeMs = lastExitTime.getTime();
    const startBarIdx = bars.findIndex((b) => new Date(b.t).getTime() >= exitTimeMs);
    if (startBarIdx === -1) break; // No more bars

    // Scan for fill at either stepped or fallback level
    let fillBarIndex = -1;
    let fillPrice = steppedLevel;

    for (let i = startBarIdx; i < bars.length; i++) {
      const bar = bars[i];

      // Check stepped level fill
      const steppedFilled = isLong ? bar.l <= steppedLevel : bar.h >= steppedLevel;
      // Check fallback level fill
      const fallbackFilled = isLong ? bar.l <= originalLevel : bar.h >= originalLevel;

      if (steppedFilled) {
        fillBarIndex = i;
        fillPrice = steppedLevel;
        break;
      }
      if (fallbackFilled) {
        fillBarIndex = i;
        fillPrice = originalLevel;
        break;
      }
    }

    // Entry never fills for this retry
    if (fillBarIndex === -1) {
      retryTrades.push({
        alertId: alert.id,
        symbol: alert.symbol,
        side,
        entryPrice: steppedLevel,
        entryTime: lastExitTime,
        exitPrice: 0,
        exitTime: lastExitTime,
        exitReason: 'entry_never_filled',
        highestTpHit: null,
        tpProgression: [],
        grossPnl: 0,
        netPnl: 0,
        vpvrPoc: vpvr.poc,
        vpvrVah: vpvr.vah,
        vpvrVal: vpvr.val,
        entryFilled: false,
        retryCount: retry,
        originalAlertId: alert.id,
      });
      break;
    }

    // Calculate SL from fill price
    const slBufferTicks = cfg.slBufferTicks;
    const symbol = cfg.symbol || alert.symbol;
    const initialSl = slBufferTicks > 0
      ? calculateSlFromEntry(fillPrice, side, symbol, slBufferTicks)
      : ((): number => {
          // Mirrored TP1 distance
          const tp1Distance = isLong ? vpvr.poc - fillPrice : fillPrice - vpvr.poc;
          return isLong ? fillPrice - tp1Distance : fillPrice + tp1Distance;
        })();

    // Same TP levels as original
    const entry = calculateEntryPrice(alert.action, vpvr, {
      symbol: alert.symbol,
      slBufferTicks: cfg.slBufferTicks,
    });
    if (!entry) break;

    // Build position for trailing stop evaluation
    const position: ManagedPosition = {
      id: `sim-retry-${alert.id}-${retry}`,
      alertId: alert.id,
      symbol: alert.symbol,
      side,
      state: 'active' as PositionState,
      entryPrice: fillPrice,
      targetEntryPrice: steppedLevel,
      quantity: cfg.quantity,
      contractId: '',
      accountId: 0,
      currentSl: initialSl,
      initialSl,
      tp1Price: entry.tp1,
      tp2Price: entry.tp2,
      tp3Price: entry.tp3,
      unrealizedPnl: 0,
      vpvrData: vpvr,
      createdAt: new Date(bars[fillBarIndex].t),
      updatedAt: new Date(bars[fillBarIndex].t),
      dirty: false,
      retryCount: retry,
      maxRetries: cfg.maxRetries,
      originalAlertId: alert.id,
      retryEntryLevels: retryLevels,
      strategy: 'vpvr',
      alertSource: 'backtest',
    };

    const tpProgression: string[] = [];
    let highestTpHit: string | null = null;
    let tradeExited = false;

    // Walk remaining bars for TP/SL
    for (let i = fillBarIndex; i < bars.length; i++) {
      const bar = bars[i];

      const pricesToCheck = isLong
        ? [bar.l, bar.h]
        : [bar.h, bar.l];

      for (const price of pricesToCheck) {
        const result = evaluateTrailingStop(position, price);

        if (result.shouldClose) {
          const exitPrice = position.currentSl;
          const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, alert.symbol);

          const trade: SimulatedTrade = {
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
            netPnl: pnl,
            vpvrPoc: vpvr.poc,
            vpvrVah: vpvr.vah,
            vpvrVal: vpvr.val,
            entryFilled: true,
            retryCount: retry,
            originalAlertId: alert.id,
          };

          retryTrades.push(trade);
          lastExitTime = new Date(bar.t);
          lastExitReason = result.closeReason ?? 'sl_hit';
          tradeExited = true;
          break;
        }

        if (result.newState) {
          position.state = result.newState;
          position.updatedAt = new Date(bar.t);
          if (result.newSl != null) {
            position.currentSl = result.newSl;
          }
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

      if (tradeExited) break;
    }

    if (!tradeExited) {
      // Bars exhausted
      const lastBar = bars[bars.length - 1];
      const exitPrice = lastBar.c;
      const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, alert.symbol);

      retryTrades.push({
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
        vpvrPoc: vpvr.poc,
        vpvrVah: vpvr.vah,
        vpvrVal: vpvr.val,
        entryFilled: true,
        retryCount: retry,
        originalAlertId: alert.id,
      });
      break;
    }
  }

  return retryTrades;
}

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

  // Calculate entry levels (with slBufferTicks if configured)
  const entry = calculateEntryPrice(alert.action, vpvrResult, {
    symbol: cfg.symbol || alert.symbol,
    slBufferTicks: cfg.slBufferTicks,
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
      retryCount: 0,
      originalAlertId: alert.id,
    };
  }

  // Calculate actual SL from fill price if using tick buffer
  const initialSl = cfg.slBufferTicks > 0
    ? calculateSlFromEntry(fillPrice, side, cfg.symbol || alert.symbol, cfg.slBufferTicks)
    : entry.initialSl;

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
    currentSl: initialSl,
    initialSl,
    tp1Price: entry.tp1,
    tp2Price: entry.tp2,
    tp3Price: entry.tp3,
    unrealizedPnl: 0,
    vpvrData: vpvrResult,
    createdAt: new Date(bars[fillBarIndex].t),
    updatedAt: new Date(bars[fillBarIndex].t),
    dirty: false,
    retryCount: 0,
    maxRetries: cfg.maxRetries,
    originalAlertId: alert.id,
    retryEntryLevels: [],
    strategy: 'vpvr',
    alertSource: 'backtest',
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
        const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, cfg.symbol || alert.symbol);

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
          retryCount: 0,
          originalAlertId: alert.id,
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
  const pnl = calculatePnl(side, fillPrice, exitPrice, cfg.quantity, cfg.symbol || alert.symbol);

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
    retryCount: 0,
    originalAlertId: alert.id,
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
