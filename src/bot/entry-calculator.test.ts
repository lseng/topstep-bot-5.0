import { describe, it, expect } from 'vitest';
import { calculateEntryPrice } from './entry-calculator';
import type { VpvrResult } from '../services/vpvr/types';

/** Helper to create a VpvrResult with given levels */
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

describe('calculateEntryPrice', () => {
  describe('BUY (long)', () => {
    it('places entry at VAL', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr);
      expect(result).not.toBeNull();
      expect(result!.entryPrice).toBe(5020); // VAL
    });

    it('sets TP1 to POC', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.tp1).toBe(5050); // POC
    });

    it('sets TP2 to VAH', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.tp2).toBe(5080); // VAH
    });

    it('sets TP3 to range high', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.tp3).toBe(5100); // rangeHigh
    });

    it('sets initial SL below VAL by buffer ticks', () => {
      const vpvr = makeVpvr();
      // Default: 8 ticks * 0.25 (ES tick size) = 2.0 points
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.initialSl).toBe(5018); // 5020 - 2.0
    });

    it('respects custom SL buffer ticks', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr, { slBufferTicks: 4 })!;
      // 4 ticks * 0.25 = 1.0
      expect(result.initialSl).toBe(5019); // 5020 - 1.0
    });

    it('uses correct tick size for NQ', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr, { symbol: 'NQ', slBufferTicks: 8 })!;
      // NQ tick size is 0.25, so 8 * 0.25 = 2.0
      expect(result.initialSl).toBe(5018);
    });

    it('uses correct tick size for MES', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr, { symbol: 'MES', slBufferTicks: 8 })!;
      // MES tick size is 0.25, so 8 * 0.25 = 2.0
      expect(result.initialSl).toBe(5018);
    });
  });

  describe('SELL (short)', () => {
    it('places entry at VAH', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('sell', vpvr);
      expect(result).not.toBeNull();
      expect(result!.entryPrice).toBe(5080); // VAH
    });

    it('sets TP1 to POC', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('sell', vpvr)!;
      expect(result.tp1).toBe(5050); // POC
    });

    it('sets TP2 to VAL', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('sell', vpvr)!;
      expect(result.tp2).toBe(5020); // VAL
    });

    it('sets TP3 to range low', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('sell', vpvr)!;
      expect(result.tp3).toBe(5000); // rangeLow
    });

    it('sets initial SL above VAH by buffer ticks', () => {
      const vpvr = makeVpvr();
      // Default: 8 ticks * 0.25 = 2.0
      const result = calculateEntryPrice('sell', vpvr)!;
      expect(result.initialSl).toBe(5082); // 5080 + 2.0
    });
  });

  describe('close actions', () => {
    it('returns null for close', () => {
      expect(calculateEntryPrice('close', makeVpvr())).toBeNull();
    });

    it('returns null for close_long', () => {
      expect(calculateEntryPrice('close_long', makeVpvr())).toBeNull();
    });

    it('returns null for close_short', () => {
      expect(calculateEntryPrice('close_short', makeVpvr())).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles flat range (VAL === VAH === POC)', () => {
      const vpvr = makeVpvr({ poc: 5000, vah: 5000, val: 5000, rangeHigh: 5000, rangeLow: 5000 });
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.entryPrice).toBe(5000);
      expect(result.tp1).toBe(5000);
      expect(result.tp2).toBe(5000);
      expect(result.tp3).toBe(5000);
    });

    it('handles narrow value area', () => {
      const vpvr = makeVpvr({ poc: 5050, vah: 5051, val: 5049 });
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.entryPrice).toBe(5049);
      expect(result.tp1).toBe(5050);
      expect(result.tp2).toBe(5051);
    });

    it('defaults to ES tick size for unknown symbol', () => {
      const vpvr = makeVpvr();
      const result = calculateEntryPrice('buy', vpvr, { symbol: 'UNKNOWN' })!;
      // Falls back to 0.25 tick size: 8 * 0.25 = 2.0
      expect(result.initialSl).toBe(5018);
    });
  });
});
