import { describe, it, expect } from 'vitest';
import { simulateTrade } from './simulator';
import type { AlertRow } from '../../types/database';
import type { Bar } from '../../services/topstepx/types';
import type { VpvrResult } from '../../services/vpvr/types';

/** Helper to create an alert row */
function makeAlert(overrides?: Partial<AlertRow>): AlertRow {
  return {
    id: 'alert-1',
    created_at: '2026-02-12T15:00:00Z',
    symbol: 'ES',
    action: 'buy',
    quantity: 1,
    order_type: 'market',
    price: null,
    stop_loss: null,
    take_profit: null,
    comment: null,
    status: 'received',
    error_message: null,
    order_id: null,
    executed_at: null,
    raw_payload: {},
    ...overrides,
  };
}

/** Helper to create a bar */
function makeBar(t: string, o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t, o, h, l, c, v };
}

/** Helper to create a VPVR result */
function makeVpvr(overrides?: Partial<VpvrResult>): VpvrResult {
  return {
    bins: [],
    poc: 5050,
    vah: 5080,
    val: 5020,
    totalVolume: 100000,
    rangeHigh: 5100,
    rangeLow: 5000,
    barCount: 60,
    ...overrides,
  };
}

const config = { quantity: 1, symbol: 'ES' };

describe('simulateTrade', () => {
  describe('long entry fill at VAL', () => {
    it('fills when bar low reaches VAL', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      // Bar dips to VAL (5020) then rises
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5030, 5035, 5019, 5032),
        makeBar('2026-02-12T15:10:00Z', 5032, 5055, 5030, 5052),
      ];

      const result = simulateTrade(alert, bars, vpvr, config);
      expect(result).not.toBeNull();
      expect(result!.entryFilled).toBe(true);
      expect(result!.entryPrice).toBe(5020); // VAL
      expect(result!.side).toBe('long');
    });
  });

  describe('short entry fill at VAH', () => {
    it('fills when bar high reaches VAH', () => {
      const alert = makeAlert({ action: 'sell' });
      const vpvr = makeVpvr();
      // Bar rises to VAH (5080) then drops
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5070, 5081, 5068, 5072),
        makeBar('2026-02-12T15:10:00Z', 5072, 5075, 5040, 5045),
      ];

      const result = simulateTrade(alert, bars, vpvr, config);
      expect(result).not.toBeNull();
      expect(result!.entryFilled).toBe(true);
      expect(result!.entryPrice).toBe(5080); // VAH
      expect(result!.side).toBe('short');
    });
  });

  describe('TP progression', () => {
    it('long: TP1 hit then SL at breakeven', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      const bars: Bar[] = [
        // Fill at VAL
        makeBar('2026-02-12T15:05:00Z', 5025, 5025, 5019, 5022),
        // Rise to TP1 (POC=5050)
        makeBar('2026-02-12T15:10:00Z', 5022, 5052, 5021, 5051),
        // Drop back to entry (SL now at breakeven=5020)
        makeBar('2026-02-12T15:15:00Z', 5051, 5051, 5019, 5019),
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      expect(result.entryFilled).toBe(true);
      expect(result.highestTpHit).toBe('tp1');
      expect(result.tpProgression).toEqual(['tp1']);
      expect(result.exitReason).toBe('sl_hit_from_tp1_hit');
      expect(result.exitPrice).toBe(5020); // Exited at breakeven SL
    });

    it('long: TP1 → TP2 → SL at TP1', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5025, 5025, 5019, 5022), // Fill
        makeBar('2026-02-12T15:10:00Z', 5022, 5055, 5021, 5054), // TP1 hit
        makeBar('2026-02-12T15:15:00Z', 5054, 5082, 5053, 5081), // TP2 hit
        makeBar('2026-02-12T15:20:00Z', 5081, 5082, 5049, 5049), // SL hit at TP1 (5050)
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      expect(result.highestTpHit).toBe('tp2');
      expect(result.tpProgression).toEqual(['tp1', 'tp2']);
      expect(result.exitReason).toBe('sl_hit_from_tp2_hit');
      expect(result.exitPrice).toBe(5050); // Exited at TP1 SL
    });
  });

  describe('SL hit scenarios', () => {
    it('long: SL hit immediately (price drops below initial SL)', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      // Initial SL = VAL - (POC - VAL) = 5020 - 30 = 4990 (mirrored TP1 distance)
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5025, 5025, 5019, 5022), // Fill at VAL
        makeBar('2026-02-12T15:10:00Z', 5022, 5023, 4989, 4989), // SL breach at 4990
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      expect(result.entryFilled).toBe(true);
      expect(result.exitReason).toBe('sl_hit_from_active');
      expect(result.exitPrice).toBe(4990); // Exit at SL level
      expect(result.grossPnl).toBe(-1500); // (4990-5020) * 50 = -1500
    });
  });

  describe('entry never fills', () => {
    it('returns unfilled trade when price never reaches entry', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr(); // VAL = 5020
      // Price stays above VAL
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5030, 5040, 5025, 5035),
        makeBar('2026-02-12T15:10:00Z', 5035, 5045, 5030, 5040),
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      expect(result.entryFilled).toBe(false);
      expect(result.exitReason).toBe('entry_never_filled');
      expect(result.grossPnl).toBe(0);
    });
  });

  describe('close actions', () => {
    it('returns null for close action', () => {
      const alert = makeAlert({ action: 'close' });
      const result = simulateTrade(alert, [], makeVpvr(), config);
      expect(result).toBeNull();
    });
  });

  describe('P&L calculation', () => {
    it('calculates correct P&L for long winning trade', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5025, 5025, 5019, 5022), // Fill at 5020
        makeBar('2026-02-12T15:10:00Z', 5022, 5055, 5021, 5054), // TP1 hit
        makeBar('2026-02-12T15:15:00Z', 5054, 5055, 5019, 5019), // SL hit at BE
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      // Exit at breakeven (entry=5020), so P&L = 0
      expect(result.grossPnl).toBe(0);
    });

    it('calculates correct P&L for short winning trade', () => {
      const alert = makeAlert({ action: 'sell' });
      const vpvr = makeVpvr();
      // Short entry at VAH=5080, SL=5110 (mirrored TP1: 5080 + 30)
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5075, 5081, 5070, 5072), // Fill at 5080
        makeBar('2026-02-12T15:10:00Z', 5072, 5075, 5048, 5049), // TP1 hit at 5050
        makeBar('2026-02-12T15:15:00Z', 5049, 5081, 5048, 5081), // SL hit at BE (5080)
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      // Exit at breakeven (entry=5080), P&L = 0
      expect(result.grossPnl).toBe(0);
    });
  });

  describe('bars exhausted', () => {
    it('closes at last bar close when bars run out', () => {
      const alert = makeAlert({ action: 'buy' });
      const vpvr = makeVpvr();
      const bars: Bar[] = [
        makeBar('2026-02-12T15:05:00Z', 5025, 5025, 5019, 5022), // Fill at 5020
        makeBar('2026-02-12T15:10:00Z', 5022, 5040, 5021, 5035), // No TP/SL hit
      ];

      const result = simulateTrade(alert, bars, vpvr, config)!;
      expect(result.entryFilled).toBe(true);
      expect(result.exitReason).toBe('bars_exhausted');
      expect(result.exitPrice).toBe(5035); // Last bar close
      // P&L = (5035 - 5020) * 50 = 750
      expect(result.grossPnl).toBe(750);
    });
  });
});
