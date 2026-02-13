// Backtest Simulator — Pure function
// Given an alert + historical bars → simulate trade lifecycle

import { calculateVPVR } from '../../services/vpvr/calculator';
import { calculateEntry } from '../entry-calculator';
import { evaluateTrailingStop } from '../trailing-stop';
import type { VPVRBar } from '../../services/vpvr/types';
import type { TradeAction, PositionState } from '../../types/database';
import type { SimulatedTrade } from './types';

interface SimulateInput {
  alertId: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  alertTime: string;
  bars: VPVRBar[];
}

/**
 * Simulate a complete trade lifecycle from VPVR-based entry to exit.
 * Returns null if the entry was never hit.
 */
export function simulateTrade(input: SimulateInput): SimulatedTrade | null {
  const { alertId, symbol, action, quantity, alertTime, bars } = input;

  if (action !== 'buy' && action !== 'sell') return null;
  if (bars.length === 0) return null;

  // Calculate VPVR from the bars before alert time
  const vpvr = calculateVPVR(bars);
  const entry = calculateEntry(vpvr, action);

  // Simulate bar-by-bar through remaining data
  let filled = false;
  let entryPrice = 0;
  let entryTime = alertTime;
  let state: PositionState = 'pending_entry';
  let currentSl = entry.initialSl;
  let highestTpHit: string | null = null;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const isLong = entry.side === 'long';

    // Check if entry would be filled this bar
    if (!filled) {
      const entryHit = isLong
        ? bar.low <= entry.targetEntryPrice
        : bar.high >= entry.targetEntryPrice;

      if (entryHit) {
        filled = true;
        entryPrice = entry.targetEntryPrice;
        entryTime = alertTime; // Use alert time as approximation
        state = 'active';
      }
      continue;
    }

    // Simulate tick at each bar's close
    const result = evaluateTrailingStop({
      side: entry.side,
      state,
      currentPrice: bar.close,
      entryPrice,
      currentSl,
      tp1Price: entry.tp1Price,
      tp2Price: entry.tp2Price,
      tp3Price: entry.tp3Price,
    });

    if (result.tpHit) {
      highestTpHit = result.tpHit;
    }

    state = result.newState;
    currentSl = result.newSl;

    if (result.slBreached) {
      const exitPrice = bar.close;
      const priceDiff = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
      return {
        alertId,
        symbol,
        side: entry.side,
        entryPrice,
        exitPrice,
        entryTime,
        exitTime: alertTime,
        exitReason: 'sl_breach',
        quantity,
        grossPnl: priceDiff * quantity,
        highestTpHit,
        vpvrPoc: vpvr.poc,
        vpvrVah: vpvr.vah,
        vpvrVal: vpvr.val,
      };
    }

    // Also check high/low for more accurate TP/SL detection
    const extremePrice = isLong ? bar.high : bar.low;
    const extremeResult = evaluateTrailingStop({
      side: entry.side,
      state,
      currentPrice: extremePrice,
      entryPrice,
      currentSl,
      tp1Price: entry.tp1Price,
      tp2Price: entry.tp2Price,
      tp3Price: entry.tp3Price,
    });

    if (extremeResult.tpHit) {
      highestTpHit = extremeResult.tpHit;
    }
    state = extremeResult.newState;
    currentSl = extremeResult.newSl;
  }

  // If we get through all bars and position is still open, close at last price
  if (filled) {
    const lastBar = bars[bars.length - 1];
    const exitPrice = lastBar.close;
    const isLong = entry.side === 'long';
    const priceDiff = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;

    return {
      alertId,
      symbol,
      side: entry.side,
      entryPrice,
      exitPrice,
      entryTime,
      exitTime: alertTime,
      exitReason: 'end_of_data',
      quantity,
      grossPnl: priceDiff * quantity,
      highestTpHit,
      vpvrPoc: vpvr.poc,
      vpvrVah: vpvr.vah,
      vpvrVal: vpvr.val,
    };
  }

  // Entry never hit
  return null;
}
