import { describe, it, expect } from 'vitest';
import { calculateVPVR } from './calculator';
import type { VPVRBar } from './types';

describe('calculateVPVR', () => {
  it('should throw on empty bars', () => {
    expect(() => calculateVPVR([])).toThrow('Cannot calculate VPVR with empty bars');
  });

  it('should handle a single bar', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ];
    const result = calculateVPVR(bars);

    expect(result.rangeHigh).toBe(110);
    expect(result.rangeLow).toBe(90);
    expect(result.totalVolume).toBe(1000);
    expect(result.poc).toBeGreaterThanOrEqual(90);
    expect(result.poc).toBeLessThanOrEqual(110);
    expect(result.val).toBeGreaterThanOrEqual(90);
    expect(result.vah).toBeLessThanOrEqual(110);
    expect(result.val).toBeLessThanOrEqual(result.poc);
    expect(result.vah).toBeGreaterThanOrEqual(result.poc);
  });

  it('should handle bars with equal prices (single price)', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 100, low: 100, close: 100, volume: 500 },
      { open: 100, high: 100, low: 100, close: 100, volume: 300 },
    ];
    const result = calculateVPVR(bars);

    expect(result.poc).toBe(100);
    expect(result.vah).toBe(100);
    expect(result.val).toBe(100);
    expect(result.totalVolume).toBe(800);
  });

  it('should find POC at the price level with highest volume', () => {
    // Create bars where most volume is concentrated at a specific level
    const bars: VPVRBar[] = [
      // Low volume at bottom
      { open: 100, high: 105, low: 95, close: 103, volume: 100 },
      // High volume concentrated in 115-120 range
      { open: 115, high: 120, low: 115, close: 118, volume: 5000 },
      { open: 116, high: 120, low: 115, close: 119, volume: 5000 },
      // Low volume at top
      { open: 130, high: 135, low: 128, close: 132, volume: 100 },
    ];
    const result = calculateVPVR(bars);

    // POC should be in the 115-120 range where most volume is
    expect(result.poc).toBeGreaterThanOrEqual(115);
    expect(result.poc).toBeLessThanOrEqual(120);
    expect(result.rangeHigh).toBe(135);
    expect(result.rangeLow).toBe(95);
  });

  it('should compute VAH > POC > VAL ordering', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 110, low: 90, close: 105, volume: 500 },
      { open: 105, high: 115, low: 95, close: 110, volume: 800 },
      { open: 110, high: 120, low: 100, close: 108, volume: 600 },
      { open: 108, high: 112, low: 98, close: 102, volume: 700 },
      { open: 102, high: 118, low: 92, close: 115, volume: 400 },
    ];
    const result = calculateVPVR(bars);

    expect(result.val).toBeLessThanOrEqual(result.poc);
    expect(result.vah).toBeGreaterThanOrEqual(result.poc);
    expect(result.val).toBeGreaterThanOrEqual(result.rangeLow);
    expect(result.vah).toBeLessThanOrEqual(result.rangeHigh);
  });

  it('should respect custom value area percent', () => {
    const bars: VPVRBar[] = Array.from({ length: 20 }, (_, i) => ({
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
      volume: 100 + Math.random() * 200,
    }));

    const result70 = calculateVPVR(bars, { valueAreaPercent: 70 });
    const result90 = calculateVPVR(bars, { valueAreaPercent: 90 });

    // Wider value area should have wider VA range
    const vaWidth70 = result70.vah - result70.val;
    const vaWidth90 = result90.vah - result90.val;
    expect(vaWidth90).toBeGreaterThanOrEqual(vaWidth70);
  });

  it('should respect custom number of bins', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ];

    const result10 = calculateVPVR(bars, { numBins: 10 });
    const result50 = calculateVPVR(bars, { numBins: 50 });

    expect(result10.profileBins).toHaveLength(10);
    expect(result50.profileBins).toHaveLength(50);
  });

  it('should distribute volume correctly across multiple bars', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 110, low: 100, close: 110, volume: 1000 },
      { open: 110, high: 120, low: 110, close: 120, volume: 2000 },
    ];
    const result = calculateVPVR(bars);

    expect(result.totalVolume).toBe(3000);
    expect(result.rangeHigh).toBe(120);
    expect(result.rangeLow).toBe(100);
  });

  it('should return profileBins with priceLevel and volume', () => {
    const bars: VPVRBar[] = [
      { open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ];
    const result = calculateVPVR(bars);

    expect(result.profileBins.length).toBeGreaterThan(0);
    for (const bin of result.profileBins) {
      expect(typeof bin.priceLevel).toBe('number');
      expect(typeof bin.volume).toBe('number');
      expect(bin.volume).toBeGreaterThanOrEqual(0);
    }
  });
});
