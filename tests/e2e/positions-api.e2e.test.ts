// E2E test suite for GET /api/positions endpoint

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

import handler from '../../api/positions';

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

describe('GET /api/positions (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMethodCalls();
    fromCallIndex = 0;
    countResult = { count: 2, error: null };
    dataResult = {
      data: [
        {
          id: 'pos-1',
          symbol: 'ES',
          side: 'long',
          state: 'active',
          entry_price: 5020,
          unrealized_pnl: 150,
          current_sl: 5018,
          tp1_price: 5050,
          tp2_price: 5080,
          tp3_price: 5100,
          created_at: '2026-01-15T10:00:00Z',
          updated_at: '2026-01-15T10:05:00Z',
        },
        {
          id: 'pos-2',
          symbol: 'ES',
          side: 'short',
          state: 'tp1_hit',
          entry_price: 5080,
          unrealized_pnl: 300,
          current_sl: 5080,
          tp1_price: 5050,
          tp2_price: 5020,
          tp3_price: 5000,
          created_at: '2026-01-15T11:00:00Z',
          updated_at: '2026-01-15T11:30:00Z',
        },
      ],
      error: null,
    };
  });

  it('returns all positions with pagination metadata', async () => {
    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { success: boolean; data: unknown[]; pagination: { total: number; page: number } };
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
    expect(data.pagination.page).toBe(1);
  });

  it('queries the positions table', async () => {
    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res } = createMockResponse();

    await handler(req, res);

    expect(mockFrom).toHaveBeenCalledWith('positions');
  });

  it('filters by state and returns correct response', async () => {
    countResult = { count: 1, error: null };
    dataResult = {
      data: [{ id: 'pos-1', state: 'active' }],
      error: null,
    };

    const req = { method: 'GET', query: { state: 'active' } } as unknown as VercelRequest;
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(200);
    const data = getData() as { data: { id: string; state: string }[] };
    expect(data.data).toHaveLength(1);
    expect(data.data[0].state).toBe('active');
  });

  it('handles database errors gracefully', async () => {
    countResult = { count: null, error: { message: 'Connection timeout' } };

    const req = { method: 'GET', query: {} } as unknown as VercelRequest;
    const { res, getStatus, getData } = createMockResponse();

    await handler(req, res);

    expect(getStatus()).toBe(500);
    const data = getData() as { success: boolean; error: string };
    expect(data.success).toBe(false);
    expect(data.error).toBe('Database error');
  });
});
