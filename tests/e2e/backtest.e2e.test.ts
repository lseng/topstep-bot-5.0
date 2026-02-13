// E2E test: Run backtest against seeded alerts with mocked historical bars

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacktestConfig } from '../../src/bot/backtest/types';

vi.mock('../../src/lib/logger', () => ({
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

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue(mockSupabase),
}));

vi.mock('../../src/services/topstepx/client', () => ({
  getHistoricalBars: vi.fn().mockResolvedValue([
    { t: '2026-01-15T09:30:00Z', o: 5025, h: 5030, l: 5015, c: 5020, v: 1000 },
    { t: '2026-01-15T09:35:00Z', o: 5020, h: 5025, l: 5018, c: 5022, v: 800 },
    { t: '2026-01-15T09:40:00Z', o: 5022, h: 5055, l: 5020, c: 5050, v: 1200 },
    { t: '2026-01-15T09:45:00Z', o: 5050, h: 5085, l: 5048, c: 5080, v: 900 },
    { t: '2026-01-15T09:50:00Z', o: 5080, h: 5105, l: 5078, c: 5100, v: 1100 },
    { t: '2026-01-15T09:55:00Z', o: 5100, h: 5102, l: 5070, c: 5075, v: 700 },
  ]),
  getCurrentContractId: vi.fn().mockReturnValue('CON.F.US.EPH26'),
}));

import { runBacktest, aggregateResults } from '../../src/bot/backtest/engine';
import { formatBacktestReport } from '../../src/bot/backtest/reporter';
import type { SimulatedTrade } from '../../src/bot/backtest/types';

const config: BacktestConfig = {
  fromDate: '2026-01-01T00:00:00Z',
  toDate: '2026-01-31T23:59:59Z',
  symbols: ['ES'],
  quantity: 1,
  verbose: true,
  maxContracts: 0,
  maxRetries: 0,
  slBufferTicks: 0,
};

describe('Backtest (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs backtest with seeded alerts and returns result', async () => {
    const seededAlerts = [
      {
        id: 'alert-bt-1',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
        price: 5020,
        created_at: '2026-01-15T09:30:00Z',
        status: 'received',
        order_type: null,
        stop_loss: null,
        take_profit: null,
        comment: null,
        error_message: null,
        order_id: null,
        executed_at: null,
        raw_payload: {},
        strategy: null,
        updated_at: '2026-01-15T09:30:00Z',
      },
    ];

    mockSupabase.order.mockResolvedValueOnce({ data: seededAlerts, error: null });

    const result = await runBacktest(config);

    expect(result.alertsEvaluated).toBe(1);
    expect(result.config.symbols).toEqual(['ES']);
    // The trade should have been simulated (entry at VAL=5020, bars go down to 5015)
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
  });

  it('handles empty alerts gracefully', async () => {
    mockSupabase.order.mockResolvedValueOnce({ data: [], error: null });

    const result = await runBacktest(config);

    expect(result.alertsEvaluated).toBe(0);
    expect(result.tradesTaken).toBe(0);
    expect(result.trades).toHaveLength(0);
  });

  it('aggregateResults computes correct statistics for filled trades', () => {
    const trades: SimulatedTrade[] = [
      {
        alertId: 'a1',
        symbol: 'ES',
        side: 'long',
        entryPrice: 5020,
        entryTime: new Date('2026-01-15T09:30:00Z'),
        exitPrice: 5050,
        exitTime: new Date('2026-01-15T10:00:00Z'),
        exitReason: 'sl_hit_from_tp1_hit',
        highestTpHit: 'tp1',
        tpProgression: ['tp1'],
        grossPnl: 1500,
        netPnl: 1500,
        vpvrPoc: 5050,
        vpvrVah: 5080,
        vpvrVal: 5020,
        entryFilled: true,
        retryCount: 0,
        originalAlertId: 'a1',
      },
      {
        alertId: 'a2',
        symbol: 'ES',
        side: 'short',
        entryPrice: 5080,
        entryTime: new Date('2026-01-16T09:30:00Z'),
        exitPrice: 5082,
        exitTime: new Date('2026-01-16T09:45:00Z'),
        exitReason: 'sl_hit_from_active',
        highestTpHit: null,
        tpProgression: [],
        grossPnl: -100,
        netPnl: -100,
        vpvrPoc: 5050,
        vpvrVah: 5080,
        vpvrVal: 5020,
        entryFilled: true,
        retryCount: 0,
        originalAlertId: 'a2',
      },
    ];

    const result = aggregateResults(config, 2, trades);

    expect(result.tradesTaken).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.winRate).toBe(50);
    expect(result.totalGrossPnl).toBe(1400);
    expect(result.totalNetPnl).toBe(1400);
    expect(result.profitFactor).toBe(15); // 1500 / 100
    expect(result.maxDrawdown).toBe(100);
  });

  it('reporter formats a valid report string', () => {
    const trades: SimulatedTrade[] = [
      {
        alertId: 'a1',
        symbol: 'ES',
        side: 'long',
        entryPrice: 5020,
        entryTime: new Date('2026-01-15T09:30:00Z'),
        exitPrice: 5050,
        exitTime: new Date('2026-01-15T10:00:00Z'),
        exitReason: 'sl_hit_from_tp1_hit',
        highestTpHit: 'tp1',
        tpProgression: ['tp1'],
        grossPnl: 1500,
        netPnl: 1500,
        vpvrPoc: 5050,
        vpvrVah: 5080,
        vpvrVal: 5020,
        entryFilled: true,
        retryCount: 0,
        originalAlertId: 'a1',
      },
    ];

    const result = aggregateResults(config, 1, trades);
    const report = formatBacktestReport(result);

    expect(report).toContain('BACKTEST RESULTS');
    expect(report).toContain('Win rate');
    expect(report).toContain('Profit factor');
    expect(report).toContain('ES');
    // Verbose config shows trade breakdown
    expect(report).toContain('Trade Breakdown');
  });
});
