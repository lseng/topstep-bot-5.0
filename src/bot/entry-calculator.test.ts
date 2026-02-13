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

    it('sets SL by mirroring TP1 distance below entry', () => {
      const vpvr = makeVpvr(); // POC=5050, VAL=5020
      // TP1 distance = 5050 - 5020 = 30
      // SL = 5020 - 30 = 4990
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.initialSl).toBe(4990);
    });

    it('mirrors correctly with narrow value area', () => {
      const vpvr = makeVpvr({ poc: 5025, val: 5020 });
      // TP1 distance = 5025 - 5020 = 5
      // SL = 5020 - 5 = 5015
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.initialSl).toBe(5015);
    });

    it('mirrors correctly with wide value area', () => {
      const vpvr = makeVpvr({ poc: 5120, val: 5020 });
      // TP1 distance = 5120 - 5020 = 100
      // SL = 5020 - 100 = 4920
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.initialSl).toBe(4920);
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

    it('sets SL by mirroring TP1 distance above entry', () => {
      const vpvr = makeVpvr(); // POC=5050, VAH=5080
      // TP1 distance = 5080 - 5050 = 30
      // SL = 5080 + 30 = 5110
      const result = calculateEntryPrice('sell', vpvr)!;
      expect(result.initialSl).toBe(5110);
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
    it('handles flat range (VAL === VAH === POC) — SL equals entry', () => {
      const vpvr = makeVpvr({ poc: 5000, vah: 5000, val: 5000, rangeHigh: 5000, rangeLow: 5000 });
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.entryPrice).toBe(5000);
      // TP1 distance = 0, so SL = entry
      expect(result.initialSl).toBe(5000);
    });

    it('handles narrow value area', () => {
      const vpvr = makeVpvr({ poc: 5050, vah: 5051, val: 5049 });
      const result = calculateEntryPrice('buy', vpvr)!;
      expect(result.entryPrice).toBe(5049);
      expect(result.tp1).toBe(5050);
      // TP1 distance = 1, SL = 5049 - 1 = 5048
      expect(result.initialSl).toBe(5048);
    });
  });
});
