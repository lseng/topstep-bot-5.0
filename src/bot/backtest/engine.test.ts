import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from './engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TopstepXClient } from '../../services/topstepx/client';

function createMockSupabase(alerts: unknown[] = []): SupabaseClient {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  // Make it thenable
  Object.defineProperty(query, 'then', {
    value: (resolve: (v: { data: unknown[]; error: null }) => void) => {
      resolve({ data: alerts, error: null });
    },
  });
  // Override to return proper promise
  query.lte = vi.fn().mockReturnValue(Promise.resolve({ data: alerts, error: null }));
  query.gte = vi.fn().mockReturnValue({ ...query, lte: query.lte });
  query.eq = vi.fn().mockReturnValue({ ...query, gte: query.gte });
  query.order = vi.fn().mockReturnValue({ ...query, eq: query.eq, gte: query.gte });
  query.select = vi.fn().mockReturnValue({ ...query, order: query.order });

  return {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;
}

function createMockClient(): TopstepXClient {
  return {
    getHistoricalBars: vi.fn().mockResolvedValue({
      success: true,
      bars: [
        { timestamp: '2026-02-12T10:00:00Z', open: 18500, high: 18550, low: 18440, close: 18520, volume: 2000 },
        { timestamp: '2026-02-12T10:05:00Z', open: 18520, high: 18560, low: 18450, close: 18540, volume: 2500 },
        { timestamp: '2026-02-12T10:10:00Z', open: 18540, high: 18580, low: 18490, close: 18530, volume: 1800 },
      ],
      errorMessage: null,
    }),
  } as unknown as TopstepXClient;
}

const mockAlerts = [
  { id: 'a1', created_at: '2026-02-12T10:00:00Z', symbol: 'NQ', action: 'buy', quantity: 1, status: 'received' },
  { id: 'a2', created_at: '2026-02-12T11:00:00Z', symbol: 'NQ', action: 'sell', quantity: 1, status: 'received' },
];

describe('BacktestEngine', () => {
  let engine: BacktestEngine;
  let supabase: SupabaseClient;
  let client: TopstepXClient;

  beforeEach(() => {
    supabase = createMockSupabase(mockAlerts);
    client = createMockClient();
    engine = new BacktestEngine(supabase, client);
  });

  it('should run backtest and return results', async () => {
    const result = await engine.run({ contractId: 'CON.F.US.ENQ.M25' });

    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(typeof result.winRate).toBe('number');
    expect(typeof result.totalPnl).toBe('number');
    expect(typeof result.profitFactor).toBe('number');
  });

  it('should return empty results for no alerts', async () => {
    supabase = createMockSupabase([]);
    engine = new BacktestEngine(supabase, client);

    const result = await engine.run({ contractId: 'CON.F.US.ENQ.M25' });

    expect(result.totalTrades).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.trades).toHaveLength(0);
  });

  it('should handle API errors gracefully', async () => {
    client = {
      getHistoricalBars: vi.fn().mockRejectedValue(new Error('API Error')),
    } as unknown as TopstepXClient;
    engine = new BacktestEngine(supabase, client);

    const result = await engine.run({ contractId: 'CON.F.US.ENQ.M25' });

    // Should not throw, just skip failed alerts
    expect(result.totalTrades).toBe(0);
  });

  it('should skip close actions', async () => {
    supabase = createMockSupabase([
      { id: 'a1', created_at: '2026-02-12T10:00:00Z', symbol: 'NQ', action: 'close', quantity: 1, status: 'received' },
    ]);
    engine = new BacktestEngine(supabase, client);

    const result = await engine.run({ contractId: 'CON.F.US.ENQ.M25' });
    expect(result.totalTrades).toBe(0);
  });

  it('should handle empty bars response', async () => {
    client = {
      getHistoricalBars: vi.fn().mockResolvedValue({ success: true, bars: [], errorMessage: null }),
    } as unknown as TopstepXClient;
    engine = new BacktestEngine(supabase, client);

    const result = await engine.run({ contractId: 'CON.F.US.ENQ.M25' });
    expect(result.totalTrades).toBe(0);
  });
});
