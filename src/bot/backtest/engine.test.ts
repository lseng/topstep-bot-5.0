import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacktestConfig } from './types';

// Mock dependencies before importing
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return { mockSupabase };
});

vi.mock('../../lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue(mockSupabase),
}));

vi.mock('../../services/topstepx/client', () => ({
  getHistoricalBars: vi.fn().mockResolvedValue([]),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.EPH26'),
}));

vi.mock('../../services/vpvr/calculator', () => ({
  calculateVpvr: vi.fn().mockReturnValue({
    bins: [],
    poc: 5050,
    vah: 5080,
    val: 5020,
    totalVolume: 100000,
    rangeHigh: 5100,
    rangeLow: 5000,
    barCount: 60,
  }),
}));

vi.mock('./simulator', () => ({
  simulateTrade: vi.fn().mockReturnValue(null),
}));

import { runBacktest, aggregateResults } from './engine';
import { getHistoricalBars } from '../../services/topstepx/client';
import { simulateTrade } from './simulator';
import type { SimulatedTrade } from './types';

const mockGetHistoricalBars = vi.mocked(getHistoricalBars);
const mockSimulateTrade = vi.mocked(simulateTrade);

const defaultConfig: BacktestConfig = {
  fromDate: '2026-01-01T00:00:00Z',
  toDate: '2026-01-31T23:59:59Z',
  symbols: ['ES'],
  slBufferTicks: 8,
  quantity: 1,
  verbose: false,
};

function makeTrade(overrides?: Partial<SimulatedTrade>): SimulatedTrade {
  return {
    alertId: 'alert-1',
    symbol: 'ES',
    side: 'long',
    entryPrice: 5020,
    entryTime: new Date('2026-01-15T10:00:00Z'),
    exitPrice: 5050,
    exitTime: new Date('2026-01-15T11:00:00Z'),
    exitReason: 'sl_hit_from_tp1_hit',
    highestTpHit: 'tp1',
    tpProgression: ['tp1'],
    grossPnl: 1500,
    netPnl: 1500,
    vpvrPoc: 5050,
    vpvrVah: 5080,
    vpvrVal: 5020,
    entryFilled: true,
    ...overrides,
  };
}

describe('runBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.order.mockResolvedValue({ data: [], error: null });
  });

  it('fetches alerts filtered by symbol and date range', async () => {
    await runBacktest(defaultConfig);

    expect(mockSupabase.from).toHaveBeenCalledWith('alerts');
    expect(mockSupabase.in).toHaveBeenCalledWith('symbol', ['ES']);
    expect(mockSupabase.gte).toHaveBeenCalledWith('created_at', defaultConfig.fromDate);
    expect(mockSupabase.lte).toHaveBeenCalledWith('created_at', defaultConfig.toDate);
    expect(mockSupabase.in).toHaveBeenCalledWith('action', ['buy', 'sell']);
  });

  it('returns empty result for no alerts', async () => {
    const result = await runBacktest(defaultConfig);

    expect(result.alertsEvaluated).toBe(0);
    expect(result.tradesTaken).toBe(0);
    expect(result.trades).toHaveLength(0);
  });

  it('throws on Supabase error', async () => {
    mockSupabase.order.mockResolvedValueOnce({
      data: null,
      error: { message: 'Connection failed' },
    });

    await expect(runBacktest(defaultConfig)).rejects.toThrow('Failed to fetch alerts');
  });

  it('fetches historical bars for each alert', async () => {
    const alert = {
      id: 'alert-1',
      symbol: 'ES',
      action: 'buy',
      created_at: '2026-01-15T10:00:00Z',
      status: 'received',
    };
    mockSupabase.order.mockResolvedValueOnce({ data: [alert], error: null });
    mockGetHistoricalBars.mockResolvedValueOnce([
      { t: '2026-01-15T10:00:00Z', o: 5020, h: 5025, l: 5015, c: 5022, v: 100 },
    ]);

    await runBacktest(defaultConfig);

    expect(mockGetHistoricalBars).toHaveBeenCalledTimes(1);
  });

  it('calls simulateTrade for each alert with bars', async () => {
    const alert = {
      id: 'alert-1',
      symbol: 'ES',
      action: 'buy',
      created_at: '2026-01-15T10:00:00Z',
      status: 'received',
    };
    mockSupabase.order.mockResolvedValueOnce({ data: [alert], error: null });
    mockGetHistoricalBars.mockResolvedValueOnce([
      { t: '2026-01-15T10:00:00Z', o: 5020, h: 5025, l: 5015, c: 5022, v: 100 },
    ]);

    await runBacktest(defaultConfig);

    expect(mockSimulateTrade).toHaveBeenCalledTimes(1);
  });

  it('skips alerts with no bars', async () => {
    const alert = {
      id: 'alert-1',
      symbol: 'ES',
      action: 'buy',
      created_at: '2026-01-15T10:00:00Z',
      status: 'received',
    };
    mockSupabase.order.mockResolvedValueOnce({ data: [alert], error: null });
    mockGetHistoricalBars.mockResolvedValueOnce([]);

    const result = await runBacktest(defaultConfig);

    expect(mockSimulateTrade).not.toHaveBeenCalled();
    expect(result.tradesTaken).toBe(0);
  });
});

describe('aggregateResults', () => {
  it('calculates win rate correctly', () => {
    const trades = [
      makeTrade({ netPnl: 1500 }),
      makeTrade({ netPnl: -500 }),
      makeTrade({ netPnl: 2000 }),
    ];

    const result = aggregateResults(defaultConfig, 3, trades);

    expect(result.winRate).toBeCloseTo(66.67, 1);
    expect(result.wins).toBe(2);
    expect(result.losses).toBe(1);
  });

  it('calculates total and average P&L', () => {
    const trades = [
      makeTrade({ grossPnl: 1500, netPnl: 1400 }),
      makeTrade({ grossPnl: -500, netPnl: -600 }),
    ];

    const result = aggregateResults(defaultConfig, 2, trades);

    expect(result.totalGrossPnl).toBe(1000);
    expect(result.totalNetPnl).toBe(800);
    expect(result.avgNetPnl).toBe(400);
  });

  it('calculates profit factor', () => {
    const trades = [
      makeTrade({ grossPnl: 3000, netPnl: 3000 }),
      makeTrade({ grossPnl: -1000, netPnl: -1000 }),
    ];

    const result = aggregateResults(defaultConfig, 2, trades);

    expect(result.profitFactor).toBe(3);
  });

  it('profit factor is Infinity with no losses', () => {
    const trades = [
      makeTrade({ grossPnl: 1500, netPnl: 1500 }),
      makeTrade({ grossPnl: 500, netPnl: 500 }),
    ];

    const result = aggregateResults(defaultConfig, 2, trades);

    expect(result.profitFactor).toBe(Infinity);
  });

  it('profit factor is 0 with no trades', () => {
    const result = aggregateResults(defaultConfig, 0, []);

    expect(result.profitFactor).toBe(0);
  });

  it('calculates max drawdown', () => {
    const trades = [
      makeTrade({ netPnl: 1000 }),
      makeTrade({ netPnl: 500 }),
      makeTrade({ netPnl: -2000 }), // Drawdown: 1500 - (-500) = peak 1500, trough -500, DD=2000
      makeTrade({ netPnl: 300 }),
    ];

    const result = aggregateResults(defaultConfig, 4, trades);

    // Peak at 1500 (after 2 trades), then drops to -500 (after 3rd), DD = 2000
    expect(result.maxDrawdown).toBe(2000);
  });

  it('handles zero max drawdown (all winners)', () => {
    const trades = [
      makeTrade({ netPnl: 100 }),
      makeTrade({ netPnl: 200 }),
    ];

    const result = aggregateResults(defaultConfig, 2, trades);

    expect(result.maxDrawdown).toBe(0);
  });

  it('calculates Sharpe ratio', () => {
    const trades = [
      makeTrade({ netPnl: 1000 }),
      makeTrade({ netPnl: 500 }),
      makeTrade({ netPnl: -200 }),
      makeTrade({ netPnl: 800 }),
    ];

    const result = aggregateResults(defaultConfig, 4, trades);

    // Sharpe should be a positive number (mean > 0)
    expect(result.sharpeRatio).toBeGreaterThan(0);
  });

  it('Sharpe is 0 with fewer than 2 trades', () => {
    const trades = [makeTrade({ netPnl: 1000 })];

    const result = aggregateResults(defaultConfig, 1, trades);

    expect(result.sharpeRatio).toBe(0);
  });

  it('excludes unfilled trades from statistics', () => {
    const trades = [
      makeTrade({ netPnl: 1000, entryFilled: true }),
      makeTrade({ netPnl: 0, entryFilled: false }),
    ];

    const result = aggregateResults(defaultConfig, 2, trades);

    expect(result.tradesTaken).toBe(1);
    expect(result.wins).toBe(1);
    expect(result.totalNetPnl).toBe(1000);
  });
});
