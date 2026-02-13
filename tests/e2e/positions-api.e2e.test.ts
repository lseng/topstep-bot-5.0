// E2E test suite for GET /api/positions endpoint

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

import handler from '../../api/positions';

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

const SAMPLE_POSITIONS = [
  {
    id: 'p1000000-0000-0000-0000-000000000001',
    created_at: '2026-02-12T10:00:00Z',
    updated_at: '2026-02-12T10:05:00Z',
    symbol: 'ES',
    side: 'long',
    state: 'active',
    entry_price: 5100.25,
    quantity: 1,
    contract_id: 'ESH6',
    account_id: 12345,
    current_sl: 5090.0,
    tp1_price: 5110.0,
    tp2_price: 5120.0,
    tp3_price: 5130.0,
    unrealized_pnl: 12.50,
    last_price: 5112.75,
  },
  {
    id: 'p1000000-0000-0000-0000-000000000002',
    created_at: '2026-02-12T09:00:00Z',
    updated_at: '2026-02-12T09:30:00Z',
    symbol: 'NQ',
    side: 'short',
    state: 'closed',
    entry_price: 18500.0,
    quantity: 2,
    contract_id: 'NQH6',
    account_id: 12345,
    current_sl: null,
    tp1_price: 18400.0,
    tp2_price: 18300.0,
    tp3_price: 18200.0,
    unrealized_pnl: null,
    last_price: null,
    exit_price: 18450.0,
    exit_reason: 'sl_breach',
  },
];

describe('Positions API E2E Tests', () => {
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

  it('returns paginated positions with default parameters', async () => {
    countResult = { count: 2, error: null };
    dataResult = { data: SAMPLE_POSITIONS, error: null };

    const req = createMockRequest();
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as {
      success: boolean;
      data: typeof SAMPLE_POSITIONS;
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

  it('returns empty array when no positions exist', async () => {
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
    const esPositions = SAMPLE_POSITIONS.filter((p) => p.symbol === 'ES');
    countResult = { count: esPositions.length, error: null };
    dataResult = { data: esPositions, error: null };

    const req = createMockRequest({ query: { symbol: 'ES' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_POSITIONS };
    expect(data.data).toHaveLength(1);
    expect(data.data[0].symbol).toBe('ES');
  });

  it('filters by state', async () => {
    const active = SAMPLE_POSITIONS.filter((p) => p.state === 'active');
    countResult = { count: active.length, error: null };
    dataResult = { data: active, error: null };

    const req = createMockRequest({ query: { state: 'active' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_POSITIONS };
    expect(data.data).toHaveLength(1);
    const eqCalls = methodCalls['eq'] ?? [];
    expect(eqCalls.some(([col, val]) => col === 'state' && val === 'active')).toBe(true);
  });

  it('filters by side', async () => {
    const longs = SAMPLE_POSITIONS.filter((p) => p.side === 'long');
    countResult = { count: longs.length, error: null };
    dataResult = { data: longs, error: null };

    const req = createMockRequest({ query: { side: 'long' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: typeof SAMPLE_POSITIONS };
    expect(data.data).toHaveLength(1);
  });

  it('returns 400 for invalid sort column', async () => {
    const req = createMockRequest({ query: { sort: 'nonexistent_column' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(400);
    expect((getData() as { success: boolean }).success).toBe(false);
  });

  it('returns 400 for invalid state filter', async () => {
    const req = createMockRequest({ query: { state: 'invalid_state' } });
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(400);
    expect((getData() as { success: boolean }).success).toBe(false);
  });

  it('returns 405 for non-GET methods', async () => {
    const req = createMockRequest({ method: 'POST' });
    const { res, getStatus } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(405);
  });
});
