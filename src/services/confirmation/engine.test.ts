import { describe, it, expect } from 'vitest';
import { confirmVPVR } from './engine';
import type { VPVRResult } from '../vpvr/types';

function makeVPVR(overrides: Partial<VPVRResult> = {}): VPVRResult {
  return {
    poc: 100,
    vah: 110,
    val: 90,
    rangeHigh: 120,
    rangeLow: 80,
    profileBins: [],
    totalVolume: 10000,
    ...overrides,
  };
}

describe('confirmVPVR', () => {
  it('should return high score when levels are perfectly aligned', () => {
    const vpvr1M = makeVPVR({ poc: 100, vah: 110, val: 90 });
    const vpvr5M = makeVPVR({ poc: 100, vah: 110, val: 90 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.breakdown.pocAlignment).toBe(100);
    expect(result.breakdown.vahAlignment).toBe(100);
    expect(result.breakdown.valAlignment).toBe(100);
    expect(result.breakdown.valueAreaOverlap).toBe(100);
  });

  it('should return low score when levels are completely divergent', () => {
    const vpvr1M = makeVPVR({ poc: 90, vah: 95, val: 85, rangeHigh: 100, rangeLow: 80 });
    const vpvr5M = makeVPVR({ poc: 150, vah: 160, val: 140, rangeHigh: 170, rangeLow: 130 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('should return partial score for partially aligned levels', () => {
    const vpvr1M = makeVPVR({ poc: 100, vah: 110, val: 90 });
    const vpvr5M = makeVPVR({ poc: 103, vah: 112, val: 92 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.score).toBeGreaterThan(30);
    expect(result.score).toBeLessThan(100);
  });

  it('should include VPVR results in the output', () => {
    const vpvr1M = makeVPVR({ poc: 100 });
    const vpvr5M = makeVPVR({ poc: 105 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.vpvr1M).toBe(vpvr1M);
    expect(result.vpvr5M).toBe(vpvr5M);
  });

  it('should return score between 0 and 100', () => {
    const vpvr1M = makeVPVR();
    const vpvr5M = makeVPVR({ poc: 200, vah: 220, val: 180, rangeHigh: 250, rangeLow: 170 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should handle identical ranges with zero span', () => {
    const vpvr1M = makeVPVR({ poc: 100, vah: 100, val: 100, rangeHigh: 100, rangeLow: 100 });
    const vpvr5M = makeVPVR({ poc: 100, vah: 100, val: 100, rangeHigh: 100, rangeLow: 100 });

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.score).toBe(100);
  });

  it('should weight POC alignment most heavily', () => {
    // POC has 35% weight vs VAH/VAL at 20% each — verify POC impacts score more
    const baseline = makeVPVR({ poc: 100, vah: 110, val: 90 });

    // Shift only POC by a small amount
    const vpvr_pocShift = makeVPVR({ poc: 101, vah: 110, val: 90 });
    const pocShiftResult = confirmVPVR(baseline, vpvr_pocShift);

    // Shift only VAH by the same amount
    const vpvr_vahShift = makeVPVR({ poc: 100, vah: 111, val: 90 });
    const vahShiftResult = confirmVPVR(baseline, vpvr_vahShift);

    // POC shift should cause a larger drop than VAH shift (because POC weighted more)
    expect(pocShiftResult.score).toBeLessThanOrEqual(vahShiftResult.score);
  });

  it('should include breakdown scores', () => {
    const vpvr1M = makeVPVR();
    const vpvr5M = makeVPVR();

    const result = confirmVPVR(vpvr1M, vpvr5M);

    expect(result.breakdown).toHaveProperty('pocAlignment');
    expect(result.breakdown).toHaveProperty('vahAlignment');
    expect(result.breakdown).toHaveProperty('valAlignment');
    expect(result.breakdown).toHaveProperty('valueAreaOverlap');
  });
});
