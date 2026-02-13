// E2E test suite for GET /api/trades-log endpoint

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const methodCalls: Record<string, unknown[][]> = {};

function resetMethodCalls(): void {
  for (const key of Object.keys(methodCalls)) {
    delete methodCalls[key];
  }
}

function trackCall(name: string, args: unknown[]): void {
  if (!methodCalls[name]) methodCalls[name] = [];
  methodCalls[name].push(args);
}

function createQueryBuilder(resolveWith: unknown): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range', 'in']) {
    builder[method] = (...args: unknown[]) => {
      trackCall(method, args);
      return builder;
    };
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(resolve, reject);
  return builder;
}

let countResult: unknown;
let dataResult: unknown;
let fromCallIndex: number;

const mockFrom = vi.fn(() => {
  fromCallIndex++;
  if (fromCallIndex % 2 === 1) return createQueryBuilder(countResult);
  return createQueryBuilder(dataResult);
});

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import handler from '../../api/trades-log';

function createMockResponse(): {
  res: VercelResponse;
  getStatus: () => number;
  getData: () => unknown;
} {
  let statusCode = 200;
  let responseData: unknown = null;
  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: unknown) => {
      responseData = data;
      return res;
    }),
  } as unknown as VercelResponse;
  return { res, getStatus: () => statusCode, getData: () => responseData };
}

describe('GET /api/trades-log (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMethodCalls();
    fromCallIndex = 0;
    countResult = { count: 1, error: null };
    dataResult = {
      data: [
        {
          id: 'trade-1',
          position_id: 'pos-1',
          symbol: 'ES',
          side: 'long',
          entry_price: 5020,
          exit_price: 5050,
          quantity: 1,
          gross_pnl: 1500,
          net_pnl: 1500,
          entry_time: '2026-01-15T10:00:00Z',
          exit_time: '2026-01-15T11:00:00Z',
          exit_reason: 'sl_hit_from_tp1_hit',
          highest_tp_hit: 'tp1',
          created_at: '2026-01-15T11:00:00Z',
        },
      ],
      error: null,
    };
  });

  it('returns trades with P&L data', async () => {
    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { success: boolean; data: { net_pnl: number }[] };
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].net_pnl).toBe(1500);
  });

  it('queries the trades_log table', async () => {
    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res } = createMockResponse();

    await handler(req, res);

    expect(mockFrom).toHaveBeenCalledWith('trades_log');
  });

  it('filters by date range', async () => {
    const req = {
      method: 'GET',
      query: { from: '2026-01-01', to: '2026-01-31' },
    } as unknown as VercelRequest;
    const { res, getStatus } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const gteCalls = methodCalls.gte ?? [];
    const lteCalls = methodCalls.lte ?? [];
    expect(gteCalls.some((c) => c[0] === 'created_at' && c[1] === '2026-01-01')).toBe(true);
    expect(lteCalls.some((c) => c[0] === 'created_at' && c[1] === '2026-01-31')).toBe(true);
  });

  it('handles database errors gracefully', async () => {
    countResult = { count: null, error: { message: 'Query timeout' } };

    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(500);
    const data = getData() as { success: boolean; error: string };
    expect(data.success).toBe(false);
  });
});
