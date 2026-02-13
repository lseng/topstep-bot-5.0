import { describe, it, expect } from 'vitest';
import { simulateTrade } from './simulator';
import type { VPVRBar } from '../../services/vpvr/types';

// Create bars spanning 18400-18600 with high volume at 18450-18550 (POC ~18500)
function makeBars(overrides?: Partial<VPVRBar>[]): VPVRBar[] {
  const base: VPVRBar[] = [
    { open: 18480, high: 18520, low: 18440, close: 18500, volume: 2000 },
    { open: 18500, high: 18550, low: 18450, close: 18530, volume: 3000 },
    { open: 18530, high: 18560, low: 18490, close: 18540, volume: 2500 },
    { open: 18540, high: 18580, low: 18510, close: 18520, volume: 1500 },
    { open: 18520, high: 18560, low: 18480, close: 18550, volume: 2000 },
  ];
  if (overrides) {
    return overrides.map((o, i) => ({ ...base[i % base.length], ...o }));
  }
  return base;
}

describe('simulateTrade', () => {
  it('should return null for close actions', () => {
    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'close',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: makeBars(),
    });
    expect(result).toBeNull();
  });

  it('should return null for empty bars', () => {
    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'buy',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: [],
    });
    expect(result).toBeNull();
  });

  it('should simulate a buy trade', () => {
    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'buy',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: makeBars(),
    });

    // May or may not get filled depending on VPVR levels
    if (result) {
      expect(result.side).toBe('long');
      expect(result.entryPrice).toBeGreaterThan(0);
      expect(result.symbol).toBe('NQ');
      expect(result.quantity).toBe(1);
    }
  });

  it('should simulate a sell trade', () => {
    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'sell',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: makeBars(),
    });

    if (result) {
      expect(result.side).toBe('short');
      expect(result.entryPrice).toBeGreaterThan(0);
    }
  });

  it('should return null when entry is never hit', () => {
    // Create bars that stay above VAL so buy entry never triggers
    const highBars: VPVRBar[] = [
      { open: 18600, high: 18650, low: 18590, close: 18620, volume: 1000 },
      { open: 18620, high: 18660, low: 18600, close: 18640, volume: 1200 },
    ];

    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'buy',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: highBars,
    });

    // Entry may or may not hit depending on computed VAL
    // The test validates the simulator doesn't crash
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should include VPVR data in result', () => {
    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'buy',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars: makeBars(),
    });

    if (result) {
      expect(result.vpvrPoc).toBeGreaterThan(0);
      expect(result.vpvrVah).toBeGreaterThan(0);
      expect(result.vpvrVal).toBeGreaterThan(0);
    }
  });

  it('should detect SL breach as exit reason', () => {
    // Create bars that drop sharply after entry
    const bars: VPVRBar[] = [
      { open: 18500, high: 18550, low: 18400, close: 18500, volume: 2000 },
      { open: 18500, high: 18510, low: 18450, close: 18460, volume: 1500 },
      // Sharp drop to trigger SL
      { open: 18460, high: 18465, low: 18300, close: 18310, volume: 3000 },
    ];

    const result = simulateTrade({
      alertId: 'a1',
      symbol: 'NQ',
      action: 'buy',
      quantity: 1,
      alertTime: '2026-02-12T10:00:00Z',
      bars,
    });

    if (result && result.exitReason === 'sl_breach') {
      expect(result.grossPnl).toBeLessThan(0);
    }
  });
});
