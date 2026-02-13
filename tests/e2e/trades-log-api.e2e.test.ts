// E2E test suite for GET /api/trades-log endpoint

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => {
      trackCall(method, args);
      return builder;
    };
  }

  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    return Promise.resolve(resolveWith).then(resolve, reject);
  };

  return builder;
}

let countResult: unknown;
let dataResult: unknown;
let fromCallIndex: number;

const mockFrom = vi.fn(() => {
  fromCallIndex++;
  if (fromCallIndex === 1) {
    return createQueryBuilder(countResult);
  }
  return createQueryBuilder(dataResult);
});

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import handler from '../../api/trades-log';

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {},
    query: {},
    ...overrides,
  } as VercelRequest;
}

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

const SAMPLE_TRADES = [
  {
    id: 't1000000-0000-0000-0000-000000000001',
    created_at: '2026-02-12T11:00:00Z',
    symbol: 'ES',
    side: 'long',
    entry_price: 5100.0,
    entry_time: '2026-02-12T10:00:00Z',
    exit_price: 5120.0,
    exit_time: '2026-02-12T11:00:00Z',
    exit_reason: 'tp2_hit',
    quantity: 1,
    gross_pnl: 20.0,
    fees: 0,
    net_pnl: 20.0,
    highest_tp_hit: 'tp2',
  },
  {
    id: 't1000000-0000-0000-0000-000000000002',
    created_at: '2026-02-12T10:30:00Z',
    symbol: 'NQ',
    side: 'short',
    entry_price: 18500.0,
    entry_time: '2026-02-12T09:00:00Z',
    exit_price: 18550.0,
    exit_time: '2026-02-12T10:30:00Z',
    exit_reason: 'sl_breach',
    quantity: 2,
    gross_pnl: -100.0,
    fees: 0,
    net_pnl: -100.0,
    highest_tp_hit: null,
  },
];

describe('Trades Log API E2E Tests', () => {
  beforeEach(() => {
    fromCallIndex = 0;
    countResult = { count: 0, error: null };
    dataResult = { data: [], error: null };
    resetMethodCalls();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated trades with default parameters', async () => {
    countResult = { count: 2, error: null };
    dataResult = { data: SAMPLE_TRADES, error: null };

    const req = createMockRequest();
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as {
      success: boolean;
      data: typeof SAMPLE_TRADES;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 2,
      totalPages: 1,
    });
  });

  it('returns empty array when no trades exist', async () => {
    countResult = { count: 0, error: null };
    dataResult = { data: [], error: null };

    const req = createMockRequest();
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: unknown[]; pagination: { total: number } };
    expect(data.data).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it('filters by symbol', async () => {
    const esTrades = SAMPLE_TRADES.filter((t) => t.symbol === 'ES');
    countResult = { count: esTrades.length, error: null };
    dataResult = { data: esTrades, error: null };

    const req = createMockRequest({ query: { symbol: 'ES' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_TRADES };
    expect(data.data).toHaveLength(1);
    expect(data.data[0].symbol).toBe('ES');
  });

  it('filters by side', async () => {
    const shorts = SAMPLE_TRADES.filter((t) => t.side === 'short');
    countResult = { count: shorts.length, error: null };
    dataResult = { data: shorts, error: null };

    const req = createMockRequest({ query: { side: 'short' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_TRADES };
    expect(data.data).toHaveLength(1);
    expect(data.data[0].side).toBe('short');
  });

  it('filters by date range', async () => {
    countResult = { count: 1, error: null };
    dataResult = { data: [SAMPLE_TRADES[0]], error: null };

    const req = createMockRequest({
      query: { from: '2026-02-12T10:45:00Z', to: '2026-02-12T12:00:00Z' },
    });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_TRADES };
    expect(data.data).toHaveLength(1);
    const gteCalls = methodCalls['gte'] ?? [];
    expect(gteCalls.some(([col]) => col === 'exit_time')).toBe(true);
  });

  it('returns 400 for invalid sort column', async () => {
    const req = createMockRequest({ query: { sort: 'nonexistent_column' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(400);
    expect((getData() as { success: boolean }).success).toBe(false);
  });

  it('returns 400 for invalid from date', async () => {
    const req = createMockRequest({ query: { from: 'not-a-date' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(400);
    expect((getData() as { success: boolean }).success).toBe(false);
  });

  it('returns 405 for non-GET methods', async () => {
    const req = createMockRequest({ method: 'DELETE' });
    const { res, getStatus } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(405);
  });
});
