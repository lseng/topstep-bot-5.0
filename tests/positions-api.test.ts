import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Track Supabase query calls
let queryCalls: { method: string; args: unknown[] }[] = [];
let fromCallIndex = 0;

function trackCall(method: string, args: unknown[]) {
  queryCalls.push({ method, args });
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
  ) => {
    return Promise.resolve(resolveWith).then(resolve, reject);
  };
  return builder;
}

const mockPositions = [
  {
    id: 'pos-1',
    symbol: 'ES',
    side: 'long',
    state: 'active',
    entry_price: 5020,
    unrealized_pnl: 150,
    created_at: '2026-01-15T10:00:00Z',
  },
];

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => {
      trackCall('from', args);
      fromCallIndex++;
      if (fromCallIndex % 2 === 1) {
        // Count query
        return createQueryBuilder({ count: mockPositions.length, error: null });
      }
      // Data query
      return createQueryBuilder({ data: mockPositions, error: null });
    },
  }),
}));

import handler from '../api/positions';

let responseData: unknown;
let statusCode: number;

const mockRes: Partial<VercelResponse> = {
  status: vi.fn().mockImplementation((code) => {
    statusCode = code;
    return mockRes;
  }) as unknown as VercelResponse['status'],
  json: vi.fn().mockImplementation((data) => {
    responseData = data;
    return mockRes;
  }) as unknown as VercelResponse['json'],
};

describe('GET /api/positions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls = [];
    fromCallIndex = 0;
    responseData = undefined;
    statusCode = 0;
  });

  it('returns 405 for non-GET requests', async () => {
    const req: Partial<VercelRequest> = { method: 'POST', query: {} };
    await handler(req as VercelRequest, mockRes as VercelResponse);
    expect(statusCode).toBe(405);
  });

  it('returns paginated positions data', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: {} };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const data = responseData as { success: boolean; data: unknown[]; pagination: { total: number } };
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  it('applies symbol filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { symbol: 'ES' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const eqCalls = queryCalls.filter((c) => c.method === 'eq');
    expect(eqCalls.some((c) => c.args[0] === 'symbol' && c.args[1] === 'ES')).toBe(true);
  });

  it('applies state filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { state: 'active' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const eqCalls = queryCalls.filter((c) => c.method === 'eq');
    expect(eqCalls.some((c) => c.args[0] === 'state' && c.args[1] === 'active')).toBe(true);
  });

  it('applies side filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { side: 'long' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const eqCalls = queryCalls.filter((c) => c.method === 'eq');
    expect(eqCalls.some((c) => c.args[0] === 'side' && c.args[1] === 'long')).toBe(true);
  });

  it('rejects invalid sort column', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { sort: 'invalid_col' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid sort column');
  });

  it('rejects invalid state filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { state: 'invalid' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid state filter');
  });

  it('rejects invalid side filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { side: 'invalid' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid side filter');
  });

  it('applies custom pagination', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { page: '2', limit: '10' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const rangeCalls = queryCalls.filter((c) => c.method === 'range');
    expect(rangeCalls.length).toBeGreaterThan(0);
    // Page 2, limit 10: offset = 10, range(10, 19)
    expect(rangeCalls[0].args[0]).toBe(10);
    expect(rangeCalls[0].args[1]).toBe(19);
  });

  it('sorts by specified column and order', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { sort: 'entry_price', order: 'asc' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const orderCalls = queryCalls.filter((c) => c.method === 'order');
    expect(orderCalls.some((c) => c.args[0] === 'entry_price')).toBe(true);
  });
});
