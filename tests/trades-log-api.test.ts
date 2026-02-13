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

const mockTrades = [
  {
    id: 'trade-1',
    symbol: 'ES',
    side: 'long',
    entry_price: 5020,
    exit_price: 5050,
    net_pnl: 1500,
    exit_reason: 'sl_hit_from_tp1_hit',
    created_at: '2026-01-15T12:00:00Z',
  },
];

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => {
      trackCall('from', args);
      fromCallIndex++;
      if (fromCallIndex % 2 === 1) {
        return createQueryBuilder({ count: mockTrades.length, error: null });
      }
      return createQueryBuilder({ data: mockTrades, error: null });
    },
  }),
}));

import handler from '../api/trades-log';

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

describe('GET /api/trades-log', () => {
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

  it('returns paginated trades data', async () => {
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

  it('applies side filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { side: 'short' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const eqCalls = queryCalls.filter((c) => c.method === 'eq');
    expect(eqCalls.some((c) => c.args[0] === 'side' && c.args[1] === 'short')).toBe(true);
  });

  it('applies date range filters', async () => {
    const req: Partial<VercelRequest> = {
      method: 'GET',
      query: { from: '2026-01-01', to: '2026-01-31' },
    };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const gteCalls = queryCalls.filter((c) => c.method === 'gte');
    const lteCalls = queryCalls.filter((c) => c.method === 'lte');
    expect(gteCalls.some((c) => c.args[0] === 'created_at')).toBe(true);
    expect(lteCalls.some((c) => c.args[0] === 'created_at')).toBe(true);
  });

  it('rejects invalid sort column', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { sort: 'invalid' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid sort column');
  });

  it('rejects invalid side filter', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { side: 'invalid' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
  });

  it('rejects invalid from date', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { from: 'not-a-date' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid from date');
  });

  it('rejects invalid to date', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { to: 'not-a-date' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(400);
    const data = responseData as { error: string };
    expect(data.error).toBe('Invalid to date');
  });

  it('applies custom pagination', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { page: '3', limit: '5' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const rangeCalls = queryCalls.filter((c) => c.method === 'range');
    expect(rangeCalls.length).toBeGreaterThan(0);
    // Page 3, limit 5: offset = 10, range(10, 14)
    expect(rangeCalls[0].args[0]).toBe(10);
    expect(rangeCalls[0].args[1]).toBe(14);
  });

  it('sorts by net_pnl ascending', async () => {
    const req: Partial<VercelRequest> = { method: 'GET', query: { sort: 'net_pnl', order: 'asc' } };
    await handler(req as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const orderCalls = queryCalls.filter((c) => c.method === 'order');
    expect(orderCalls.some((c) => c.args[0] === 'net_pnl')).toBe(true);
  });
});
