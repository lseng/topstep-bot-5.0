import { describe, it, expect } from 'vitest';
import { calculateEntry } from './entry-calculator';
import type { VPVRResult } from '../services/vpvr/types';

const mockVPVR: VPVRResult = {
  poc: 18500,
  vah: 18550,
  val: 18450,
  rangeHigh: 18600,
  rangeLow: 18400,
  profileBins: [],
  totalVolume: 50000,
};

describe('calculateEntry', () => {
  describe('buy (long)', () => {
    it('should set entry at VAL', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.targetEntryPrice).toBe(18450); // VAL
    });

    it('should set side to long', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.side).toBe('long');
    });

    it('should set TP1 at POC', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.tp1Price).toBe(18500); // POC
    });

    it('should set TP2 at VAH', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.tp2Price).toBe(18550); // VAH
    });

    it('should set TP3 at Range High', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.tp3Price).toBe(18600); // Range High
    });

    it('should set SL below VAL', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.initialSl).toBeLessThan(18450); // Below VAL
    });

    it('should have TP1 < TP2 < TP3 for longs', () => {
      const result = calculateEntry(mockVPVR, 'buy');
      expect(result.tp1Price).toBeLessThanOrEqual(result.tp2Price);
      expect(result.tp2Price).toBeLessThanOrEqual(result.tp3Price);
    });
  });

  describe('sell (short)', () => {
    it('should set entry at VAH', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.targetEntryPrice).toBe(18550); // VAH
    });

    it('should set side to short', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.side).toBe('short');
    });

    it('should set TP1 at POC', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.tp1Price).toBe(18500); // POC
    });

    it('should set TP2 at VAL', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.tp2Price).toBe(18450); // VAL
    });

    it('should set TP3 at Range Low', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.tp3Price).toBe(18400); // Range Low
    });

    it('should set SL above VAH', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.initialSl).toBeGreaterThan(18550); // Above VAH
    });

    it('should have TP1 > TP2 > TP3 for shorts', () => {
      const result = calculateEntry(mockVPVR, 'sell');
      expect(result.tp1Price).toBeGreaterThanOrEqual(result.tp2Price);
      expect(result.tp2Price).toBeGreaterThanOrEqual(result.tp3Price);
    });
  });

  describe('edge cases', () => {
    it('should throw on close action', () => {
      expect(() => calculateEntry(mockVPVR, 'close')).toThrow('Invalid action');
    });

    it('should throw on close_long action', () => {
      expect(() => calculateEntry(mockVPVR, 'close_long')).toThrow('Invalid action');
    });

    it('should throw on close_short action', () => {
      expect(() => calculateEntry(mockVPVR, 'close_short')).toThrow('Invalid action');
    });

    it('should handle narrow value area', () => {
      const narrowVPVR: VPVRResult = {
        ...mockVPVR,
        vah: 18501,
        val: 18499,
        poc: 18500,
      };
      const result = calculateEntry(narrowVPVR, 'buy');
      expect(result.targetEntryPrice).toBe(18499);
      expect(result.initialSl).toBeLessThan(18499);
    });
  });
});
