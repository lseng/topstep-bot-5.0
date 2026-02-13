// E2E test suite for backtest engine
// Tests full backtest flow with mocked external services

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SAMPLE_ALERTS = [
  {
    id: 'a1',
    symbol: 'ES',
    action: 'buy',
    quantity: 1,
    created_at: '2026-02-12T10:00:00Z',
  },
  {
    id: 'a2',
    symbol: 'ES',
    action: 'sell',
    quantity: 1,
    created_at: '2026-02-12T11:00:00Z',
  },
];

const SAMPLE_BARS = [
  { timestamp: '2026-02-12T10:01:00Z', open: 5090, high: 5120, low: 5085, close: 5110, volume: 1000 },
  { timestamp: '2026-02-12T10:02:00Z', open: 5110, high: 5130, low: 5105, close: 5125, volume: 800 },
  { timestamp: '2026-02-12T10:03:00Z', open: 5125, high: 5140, low: 5120, close: 5135, volume: 600 },
  { timestamp: '2026-02-12T10:04:00Z', open: 5135, high: 5150, low: 5130, close: 5145, volume: 700 },
  { timestamp: '2026-02-12T10:05:00Z', open: 5145, high: 5155, low: 5140, close: 5150, volume: 500 },
];

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({}),
}));

import { BacktestEngine } from '../../src/bot/backtest/engine';

// Create a chainable query builder that resolves to given data
function createChainableQuery(resolveData: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = () => builder;
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    return Promise.resolve({ data: resolveData, error: null }).then(resolve, reject);
  };
  return builder;
}

function createMockSupabase(alerts: unknown[]) {
  return {
    from: () => createChainableQuery(alerts),
  };
}

function createMockClient(barsResponse: unknown) {
  return {
    getHistoricalBars: vi.fn().mockResolvedValue(barsResponse),
    authenticate: vi.fn(),
  };
}

describe('Backtest E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a full backtest and produces valid results', async () => {
    const engine = new BacktestEngine(
      createMockSupabase(SAMPLE_ALERTS) as never,
      createMockClient({ success: true, bars: SAMPLE_BARS, errorMessage: null }) as never,
    );

    const result = await engine.run({
      symbol: 'ES',
      fromDate: '2026-02-12T00:00:00Z',
      toDate: '2026-02-12T23:59:59Z',
      contractId: 'ESH6',
    });

    expect(result).toBeDefined();
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.trades)).toBe(true);
  });

  it('returns zero trades for empty alerts', async () => {
    const engine = new BacktestEngine(
      createMockSupabase([]) as never,
      createMockClient({ success: true, bars: SAMPLE_BARS, errorMessage: null }) as never,
    );

    const result = await engine.run({
      symbol: 'ES',
      fromDate: '2026-02-12T00:00:00Z',
      toDate: '2026-02-12T23:59:59Z',
      contractId: 'ESH6',
    });

    expect(result.totalTrades).toBe(0);
    expect(result.trades).toHaveLength(0);
    expect(result.winRate).toBe(0);
  });

  it('handles bar fetch errors gracefully', async () => {
    const failingClient = {
      getHistoricalBars: vi.fn().mockRejectedValue(new Error('API error')),
      authenticate: vi.fn(),
    };

    const engine = new BacktestEngine(
      createMockSupabase(SAMPLE_ALERTS) as never,
      failingClient as never,
    );

    const result = await engine.run({
      symbol: 'ES',
      fromDate: '2026-02-12T00:00:00Z',
      toDate: '2026-02-12T23:59:59Z',
      contractId: 'ESH6',
    });

    // Should still return a result (just with no trades due to bar fetch failure)
    expect(result).toBeDefined();
    expect(result.totalTrades).toBe(0);
  });

  it('skips close actions and only processes buy/sell', async () => {
    const alertsWithClose = [
      ...SAMPLE_ALERTS,
      { id: 'a3', symbol: 'ES', action: 'close', quantity: 1, created_at: '2026-02-12T12:00:00Z' },
      { id: 'a4', symbol: 'ES', action: 'close_long', quantity: 1, created_at: '2026-02-12T13:00:00Z' },
    ];

    const mockClient = createMockClient({ success: true, bars: SAMPLE_BARS, errorMessage: null });

    const engine = new BacktestEngine(
      createMockSupabase(alertsWithClose) as never,
      mockClient as never,
    );

    const result = await engine.run({
      contractId: 'ESH6',
    });

    // Only buy/sell should be processed, not close/close_long
    expect(mockClient.getHistoricalBars).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });
});
