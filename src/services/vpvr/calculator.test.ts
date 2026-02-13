import { describe, it, expect } from 'vitest';
import { calculateVpvr } from './calculator';
import type { Bar } from '../topstepx/types';

function makeBar(o: number, h: number, l: number, c: number, v: number): Bar {
  return { t: '2026-02-12T10:00:00Z', o, h, l, c, v };
}

describe('calculateVpvr', () => {
  describe('edge cases', () => {
    it('returns null for empty bars array', () => {
      expect(calculateVpvr([])).toBeNull();
    });

    it('handles single bar correctly', () => {
      const bars = [makeBar(100, 110, 90, 105, 1000)];
      const result = calculateVpvr(bars, { numBins: 4 });

      expect(result).not.toBeNull();
      expect(result!.barCount).toBe(1);
      expect(result!.rangeHigh).toBe(110);
      expect(result!.rangeLow).toBe(90);
      expect(result!.bins).toHaveLength(4);
      expect(result!.totalVolume).toBe(1000);
    });

    it('handles doji bars (h === l) without division by zero', () => {
      const bars = [makeBar(100, 100, 100, 100, 500)];
      const result = calculateVpvr(bars);

      expect(result).not.toBeNull();
      expect(result!.bins).toHaveLength(1);
      expect(result!.bins[0].buyVolume).toBe(250);
      expect(result!.bins[0].sellVolume).toBe(250);
      expect(result!.totalVolume).toBe(500);
    });

    it('handles all bars at the same price', () => {
      const bars = [
        makeBar(100, 100, 100, 100, 300),
        makeBar(100, 100, 100, 100, 200),
      ];
      const result = calculateVpvr(bars);

      expect(result).not.toBeNull();
      expect(result!.bins).toHaveLength(1);
      expect(result!.totalVolume).toBe(500);
      expect(result!.poc).toBe(100);
      expect(result!.vah).toBe(100);
      expect(result!.val).toBe(100);
    });
  });

  describe('buy/sell volume split', () => {
    it('bullish bar (close near high) has more buy volume', () => {
      // close=108, high=110, low=100 → buy = 1000*(108-100)/10 = 800
      const bars = [makeBar(100, 110, 100, 108, 1000)];
      const result = calculateVpvr(bars, { numBins: 2 });

      expect(result).not.toBeNull();
      const totalBuy = result!.bins.reduce((s, b) => s + b.buyVolume, 0);
      const totalSell = result!.bins.reduce((s, b) => s + b.sellVolume, 0);
      expect(totalBuy).toBeCloseTo(800, 1);
      expect(totalSell).toBeCloseTo(200, 1);
    });

    it('bearish bar (close near low) has more sell volume', () => {
      // close=102, high=110, low=100 → sell = 1000*(110-102)/10 = 800
      const bars = [makeBar(108, 110, 100, 102, 1000)];
      const result = calculateVpvr(bars, { numBins: 2 });

      expect(result).not.toBeNull();
      const totalBuy = result!.bins.reduce((s, b) => s + b.buyVolume, 0);
      const totalSell = result!.bins.reduce((s, b) => s + b.sellVolume, 0);
      expect(totalBuy).toBeCloseTo(200, 1);
      expect(totalSell).toBeCloseTo(800, 1);
    });
  });

  describe('bin distribution', () => {
    it('creates the correct number of bins', () => {
      const bars = [makeBar(100, 120, 100, 110, 1000)];
      const result = calculateVpvr(bars, { numBins: 10 });

      expect(result!.bins).toHaveLength(10);
    });

    it('bar fully inside one bin gets 100% of volume in that bin', () => {
      // Range [0, 100] with 10 bins → each bin is 10 wide
      // Bar: l=20, h=30 → fits entirely in bin index 2 ([20, 30])
      const bars = [makeBar(25, 30, 20, 28, 500)];
      const result = calculateVpvr(bars, { numBins: 10 });

      // Only bin[2] should have volume
      expect(result).not.toBeNull();
      // Since the bar IS the entire range, all bins span [20,30]
      // Actually with only 1 bar, range = [20, 30], so numBins=10 spans [20,30]
      // Let's use 2 bars to create a wider range
      const bars2 = [
        makeBar(0, 100, 0, 50, 0),       // range setter, no volume
        makeBar(25, 30, 20, 28, 500),     // actual volume bar
      ];
      const result2 = calculateVpvr(bars2, { numBins: 10 });

      expect(result2).not.toBeNull();
      // Bins: [0,10], [10,20], [20,30], [30,40], ...
      // Bar [20,30] overlaps fully with bin[2]
      expect(result2!.bins[2].totalVolume).toBeCloseTo(500, 0);
      // Adjacent bins should have 0 from this bar (the 0-vol range setter contributes nothing)
      expect(result2!.bins[0].totalVolume).toBe(0);
      expect(result2!.bins[1].totalVolume).toBe(0);
      expect(result2!.bins[3].totalVolume).toBe(0);
    });

    it('bar spanning two equal bins splits volume proportionally', () => {
      // Range [0, 100], 10 bins → each bin 10 wide
      // Bar: l=15, h=35 → spans 5 of bin[1] + 10 of bin[2] + 5 of bin[3]
      const bars = [
        makeBar(0, 100, 0, 50, 0),       // range setter
        makeBar(25, 35, 15, 30, 1000),    // actual bar: spans 20 points
      ];
      const result = calculateVpvr(bars, { numBins: 10 });

      expect(result).not.toBeNull();
      // Bar height = 35-15 = 20
      // bin[1] [10,20]: overlap = min(20,35)-max(10,15) = 20-15 = 5, fraction = 5/20 = 0.25
      // bin[2] [20,30]: overlap = min(30,35)-max(20,15) = 30-20 = 10, fraction = 10/20 = 0.5
      // bin[3] [30,40]: overlap = min(40,35)-max(30,15) = 35-30 = 5, fraction = 5/20 = 0.25
      expect(result!.bins[1].totalVolume).toBeCloseTo(250, 0);
      expect(result!.bins[2].totalVolume).toBeCloseTo(500, 0);
      expect(result!.bins[3].totalVolume).toBeCloseTo(250, 0);
    });

    it('total volume across all bins equals bar total volume', () => {
      const bars = [
        makeBar(100, 120, 95, 115, 2000),
        makeBar(105, 118, 98, 110, 1500),
        makeBar(110, 125, 102, 108, 1000),
      ];
      const result = calculateVpvr(bars, { numBins: 20 });

      expect(result).not.toBeNull();
      const binTotal = result!.bins.reduce((s, b) => s + b.totalVolume, 0);
      expect(binTotal).toBeCloseTo(4500, 0);
    });
  });

  describe('POC identification', () => {
    it('identifies the bin with highest total volume', () => {
      // Create bars that concentrate volume in a specific area
      const bars = [
        makeBar(0, 100, 0, 50, 0),       // range setter
        makeBar(40, 60, 40, 55, 5000),    // heavy volume in middle
        makeBar(10, 20, 10, 15, 100),     // light volume at bottom
        makeBar(80, 90, 80, 85, 100),     // light volume at top
      ];
      const result = calculateVpvr(bars, { numBins: 10 });

      expect(result).not.toBeNull();
      // POC should be near the 40-60 area (bins 4 and 5)
      expect(result!.poc).toBeGreaterThanOrEqual(40);
      expect(result!.poc).toBeLessThanOrEqual(60);
    });
  });

  describe('value area calculation', () => {
    it('captures approximately 70% of total volume', () => {
      const bars = [
        makeBar(100, 150, 100, 130, 1000),
        makeBar(110, 145, 105, 140, 2000),
        makeBar(120, 150, 110, 125, 1500),
        makeBar(115, 140, 100, 135, 1800),
        makeBar(105, 130, 95, 120, 1200),
      ];
      const result = calculateVpvr(bars, { numBins: 20 });

      expect(result).not.toBeNull();

      // Sum volume of bins between VAL and VAH
      const vaVolume = result!.bins
        .filter((b) => b.priceMid >= result!.val && b.priceMid <= result!.vah)
        .reduce((s, b) => s + b.totalVolume, 0);

      // Should be at least 70% of total
      expect(vaVolume / result!.totalVolume).toBeGreaterThanOrEqual(0.69);
    });

    it('VAH >= POC >= VAL', () => {
      const bars = [
        makeBar(100, 130, 90, 120, 1000),
        makeBar(105, 125, 95, 115, 800),
        makeBar(110, 135, 100, 112, 600),
      ];
      const result = calculateVpvr(bars, { numBins: 20 });

      expect(result).not.toBeNull();
      expect(result!.vah).toBeGreaterThanOrEqual(result!.poc);
      expect(result!.poc).toBeGreaterThanOrEqual(result!.val);
    });

    it('VAH and VAL are within the range', () => {
      const bars = [
        makeBar(50, 80, 40, 70, 2000),
        makeBar(60, 90, 50, 55, 1000),
      ];
      const result = calculateVpvr(bars, { numBins: 10 });

      expect(result).not.toBeNull();
      expect(result!.vah).toBeLessThanOrEqual(result!.rangeHigh);
      expect(result!.val).toBeGreaterThanOrEqual(result!.rangeLow);
    });
  });

  describe('known-input verification', () => {
    it('produces correct results for a contrived 3-bar dataset', () => {
      // Range: [100, 120], 4 bins → each bin 5 wide
      // Bins: [100,105], [105,110], [110,115], [115,120]
      const bars = [
        makeBar(102, 120, 100, 118, 2000), // bullish, spans all bins
        makeBar(112, 115, 110, 114, 3000), // bullish, spans bins 2 and 3
        makeBar(108, 112, 105, 106, 1000), // bearish, spans bins 1 and 2
      ];
      const result = calculateVpvr(bars, { numBins: 4 });

      expect(result).not.toBeNull();
      expect(result!.rangeHigh).toBe(120);
      expect(result!.rangeLow).toBe(100);
      expect(result!.bins).toHaveLength(4);
      expect(result!.totalVolume).toBe(6000);

      // The POC should be in bins[2] ([110,115]) since bar 2 has 3000 vol concentrated there
      expect(result!.poc).toBeCloseTo(112.5, 1);
    });
  });
});
