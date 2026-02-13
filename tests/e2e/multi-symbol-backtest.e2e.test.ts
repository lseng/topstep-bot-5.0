// E2E test: Multi-symbol backtest — run backtest with symbols: ['MES', 'MNQ']
// Verify per-symbol results and aggregate stats

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
  getCurrentContractId: vi.fn().mockImplementation((symbol: string) => {
    if (symbol === 'MNQ') return 'CON.F.US.MNQ.H26';
    return 'CON.F.US.MES.H26';
  }),
}));

import { runBacktest, aggregateResults } from '../../src/bot/backtest/engine';
import { formatBacktestReport } from '../../src/bot/backtest/reporter';
import type { SimulatedTrade } from '../../src/bot/backtest/types';

const multiConfig: BacktestConfig = {
  fromDate: '2026-01-01T00:00:00Z',
  toDate: '2026-01-31T23:59:59Z',
  symbols: ['MES', 'MNQ'],
  slBufferTicks: 8,
  quantity: 1,
  verbose: true,
};

describe('Multi-symbol backtest (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches alerts using .in() for multiple symbols', async () => {
    mockSupabase.order.mockResolvedValueOnce({ data: [], error: null });

    await runBacktest(multiConfig);

    expect(mockSupabase.in).toHaveBeenCalledWith('symbol', ['MES', 'MNQ']);
  });

  it('runs backtest with alerts from multiple symbols', async () => {
    const seededAlerts = [
      {
        id: 'alert-mes-1',
        symbol: 'MES',
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
        updated_at: '2026-01-15T09:30:00Z',
      },
      {
        id: 'alert-mnq-1',
        symbol: 'MNQ',
        action: 'sell',
        quantity: 1,
        price: 5080,
        created_at: '2026-01-15T10:00:00Z',
        status: 'received',
        order_type: null,
        stop_loss: null,
        take_profit: null,
        comment: null,
        error_message: null,
        order_id: null,
        executed_at: null,
        raw_payload: {},
        updated_at: '2026-01-15T10:00:00Z',
      },
    ];

    mockSupabase.order.mockResolvedValueOnce({ data: seededAlerts, error: null });

    const result = await runBacktest(multiConfig);

    expect(result.alertsEvaluated).toBe(2);
    expect(result.config.symbols).toEqual(['MES', 'MNQ']);
  });

  it('aggregateResults works with mixed-symbol trades', () => {
    const trades: SimulatedTrade[] = [
      {
        alertId: 'a1',
        symbol: 'MES',
        side: 'long',
        entryPrice: 5020,
        entryTime: new Date('2026-01-15T09:30:00Z'),
        exitPrice: 5050,
        exitTime: new Date('2026-01-15T10:00:00Z'),
        exitReason: 'sl_hit_from_tp1_hit',
        highestTpHit: 'tp1',
        tpProgression: ['tp1'],
        grossPnl: 150, // MES: 30 points * $5 = $150
        netPnl: 150,
        vpvrPoc: 5050,
        vpvrVah: 5080,
        vpvrVal: 5020,
        entryFilled: true,
      },
      {
        alertId: 'a2',
        symbol: 'MNQ',
        side: 'short',
        entryPrice: 5080,
        entryTime: new Date('2026-01-15T10:00:00Z'),
        exitPrice: 5050,
        exitTime: new Date('2026-01-15T10:30:00Z'),
        exitReason: 'sl_hit_from_tp1_hit',
        highestTpHit: 'tp1',
        tpProgression: ['tp1'],
        grossPnl: 60, // MNQ: 30 points * $2 = $60
        netPnl: 60,
        vpvrPoc: 5050,
        vpvrVah: 5080,
        vpvrVal: 5020,
        entryFilled: true,
      },
    ];

    const result = aggregateResults(multiConfig, 2, trades);

    expect(result.tradesTaken).toBe(2);
    expect(result.wins).toBe(2);
    expect(result.totalNetPnl).toBe(210);
    expect(result.winRate).toBe(100);
  });

  it('reporter shows per-symbol breakdown for multi-symbol results', () => {
    const trades: SimulatedTrade[] = [
      {
        alertId: 'a1', symbol: 'MES', side: 'long',
        entryPrice: 5020, entryTime: new Date(), exitPrice: 5050, exitTime: new Date(),
        exitReason: 'tp1', highestTpHit: 'tp1', tpProgression: ['tp1'],
        grossPnl: 150, netPnl: 150,
        vpvrPoc: 5050, vpvrVah: 5080, vpvrVal: 5020, entryFilled: true,
      },
      {
        alertId: 'a2', symbol: 'MNQ', side: 'short',
        entryPrice: 5080, entryTime: new Date(), exitPrice: 5050, exitTime: new Date(),
        exitReason: 'tp1', highestTpHit: 'tp1', tpProgression: ['tp1'],
        grossPnl: 60, netPnl: 60,
        vpvrPoc: 5050, vpvrVah: 5080, vpvrVal: 5020, entryFilled: true,
      },
    ];

    const result = aggregateResults(multiConfig, 2, trades);
    const report = formatBacktestReport(result);

    expect(report).toContain('MES, MNQ');
    expect(report).toContain('Per-Symbol Breakdown');
    expect(report).toContain('MES');
    expect(report).toContain('MNQ');
  });
});
