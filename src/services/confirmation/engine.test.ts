import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bar } from '../topstepx/types';
import type { VpvrResult } from '../vpvr/types';
import type { TradeAction } from '../../types';

vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetHistoricalBars = vi.fn<() => Promise<Bar[]>>();
const mockGetCurrentContractId = vi.fn<() => string>();

vi.mock('../topstepx/client', () => ({
  getHistoricalBars: (...args: unknown[]) => mockGetHistoricalBars(...args),
  getCurrentContractId: (...args: unknown[]) => mockGetCurrentContractId(...args),
}));

import { evaluateLevel, computeScore, confirmAlert } from './engine';

function makeBar(o: number, h: number, l: number, c: number, v: number): Bar {
  return { t: '2026-02-12T10:00:00Z', o, h, l, c, v };
}

function makeVpvr(poc: number, vah: number, val: number): VpvrResult {
  return {
    bins: [],
    poc,
    vah,
    val,
    totalVolume: 10000,
    rangeHigh: vah + 10,
    rangeLow: val - 10,
    barCount: 50,
  };
}

// Sample bars that create a clear volume profile
function makeSampleBars(): Bar[] {
  return [
    makeBar(100, 120, 95, 115, 2000),
    makeBar(105, 118, 98, 110, 1500),
    makeBar(110, 125, 102, 108, 1000),
    makeBar(108, 115, 100, 112, 1800),
    makeBar(103, 112, 96, 109, 1200),
  ];
}

describe('evaluateLevel', () => {
  const vpvr = makeVpvr(6925, 6950, 6900);

  describe('BUY signals', () => {
    it('returns strong when price is at/below VAL (discount)', () => {
      expect(evaluateLevel('buy', 6890, vpvr).level).toBe('strong');
      expect(evaluateLevel('buy', 6900, vpvr).level).toBe('strong');
    });

    it('returns moderate when price is between VAL and POC', () => {
      expect(evaluateLevel('buy', 6910, vpvr).level).toBe('moderate');
      expect(evaluateLevel('buy', 6925, vpvr).level).toBe('moderate');
    });

    it('returns weak when price is between POC and VAH', () => {
      expect(evaluateLevel('buy', 6940, vpvr).level).toBe('weak');
    });

    it('returns reject when price is at/above VAH (premium)', () => {
      expect(evaluateLevel('buy', 6950, vpvr).level).toBe('reject');
      expect(evaluateLevel('buy', 6980, vpvr).level).toBe('reject');
    });
  });

  describe('SELL signals', () => {
    it('returns strong when price is at/above VAH (premium)', () => {
      expect(evaluateLevel('sell', 6960, vpvr).level).toBe('strong');
      expect(evaluateLevel('sell', 6950, vpvr).level).toBe('strong');
    });

    it('returns moderate when price is between POC and VAH', () => {
      expect(evaluateLevel('sell', 6940, vpvr).level).toBe('moderate');
      expect(evaluateLevel('sell', 6925, vpvr).level).toBe('moderate');
    });

    it('returns weak when price is between VAL and POC', () => {
      expect(evaluateLevel('sell', 6910, vpvr).level).toBe('weak');
    });

    it('returns reject when price is at/below VAL (discount)', () => {
      expect(evaluateLevel('sell', 6900, vpvr).level).toBe('reject');
      expect(evaluateLevel('sell', 6880, vpvr).level).toBe('reject');
    });
  });

  describe('close actions', () => {
    const closeActions: TradeAction[] = ['close', 'close_long', 'close_short'];

    for (const action of closeActions) {
      it(`returns strong for ${action}`, () => {
        expect(evaluateLevel(action, 6925, vpvr).level).toBe('strong');
      });
    }
  });
});

describe('computeScore', () => {
  const vpvr = makeVpvr(100, 110, 90);

  function makeTfResult(level: string): { timeframe: string; vpvr: VpvrResult; level: string; reason: string } {
    return { timeframe: '1M', vpvr, level: level as 'strong' | 'moderate' | 'weak' | 'reject', reason: 'test' };
  }

  it('both strong = 100', () => {
    expect(computeScore(makeTfResult('strong'), makeTfResult('strong'))).toBe(100);
  });

  it('both moderate = 70', () => {
    expect(computeScore(makeTfResult('moderate'), makeTfResult('moderate'))).toBe(70);
  });

  it('strong + moderate = 82', () => {
    // 100*0.4 + 70*0.6 = 40 + 42 = 82
    expect(computeScore(makeTfResult('strong'), makeTfResult('moderate'))).toBe(82);
  });

  it('moderate + strong = 88', () => {
    // 70*0.4 + 100*0.6 = 28 + 60 = 88
    expect(computeScore(makeTfResult('moderate'), makeTfResult('strong'))).toBe(88);
  });

  it('strong + weak = 58', () => {
    // 100*0.4 + 30*0.6 = 40 + 18 = 58
    expect(computeScore(makeTfResult('strong'), makeTfResult('weak'))).toBe(58);
  });

  it('both weak = 30', () => {
    // 30*0.4 + 30*0.6 = 12 + 18 = 30
    expect(computeScore(makeTfResult('weak'), makeTfResult('weak'))).toBe(30);
  });

  it('any reject brings score near 0', () => {
    // 100*0.4 + 0*0.6 = 40
    expect(computeScore(makeTfResult('strong'), makeTfResult('reject'))).toBe(40);
    // 0*0.4 + 0*0.6 = 0
    expect(computeScore(makeTfResult('reject'), makeTfResult('reject'))).toBe(0);
  });
});

describe('confirmAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentContractId.mockReturnValue('CON.F.US.EP.H26');
  });

  it('fetches 1M and 5M bars in parallel', async () => {
    mockGetHistoricalBars.mockResolvedValue(makeSampleBars());

    await confirmAlert('ES', 'buy', 105);

    // Called twice — once for 1M, once for 5M
    expect(mockGetHistoricalBars).toHaveBeenCalledTimes(2);
  });

  it('returns confirmed=true when score >= minScore', async () => {
    // These bars have volume concentrated in 95-125 range
    // Price 100 is at the low end → good for BUY
    mockGetHistoricalBars.mockResolvedValue(makeSampleBars());

    const result = await confirmAlert('ES', 'buy', 97, { minScore: 50 });

    expect(result.confirmed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.action).toBe('buy');
    expect(result.price).toBe(97);
    expect(result.timeframes).toHaveLength(2);
  });

  it('returns confirmed=false when score < minScore', async () => {
    // Price 125 is at the high end → bad for BUY (premium zone)
    mockGetHistoricalBars.mockResolvedValue(makeSampleBars());

    const result = await confirmAlert('ES', 'buy', 125, { minScore: 50 });

    expect(result.confirmed).toBe(false);
    expect(result.level).toBe('reject');
  });

  it('always confirms close actions without fetching bars', async () => {
    const result = await confirmAlert('ES', 'close', 100);

    expect(result.confirmed).toBe(true);
    expect(result.score).toBe(100);
    expect(mockGetHistoricalBars).not.toHaveBeenCalled();
  });

  it('handles API failure gracefully', async () => {
    mockGetHistoricalBars.mockRejectedValue(new Error('API timeout'));

    const result = await confirmAlert('ES', 'buy', 100);

    // Both timeframes fail → reject
    expect(result.confirmed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.level).toBe('reject');
  });

  it('works with only one timeframe available', async () => {
    let callCount = 0;
    mockGetHistoricalBars.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(makeSampleBars());
      return Promise.reject(new Error('5M bars unavailable'));
    });

    const result = await confirmAlert('ES', 'buy', 97);

    // Should still produce a result from the one working timeframe
    expect(result.timeframes).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles empty bar data', async () => {
    mockGetHistoricalBars.mockResolvedValue([]);

    const result = await confirmAlert('ES', 'sell', 100);

    expect(result.confirmed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('includes summary with action, price, and score', async () => {
    mockGetHistoricalBars.mockResolvedValue(makeSampleBars());

    const result = await confirmAlert('ES', 'sell', 120);

    expect(result.summary).toContain('SELL');
    expect(result.summary).toContain('120');
    expect(result.summary).toContain('/100');
    expect(result.timestamp).toBeTruthy();
  });
});
