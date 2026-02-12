import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Track method calls for assertions
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

// Create a thenable query builder that resolves to a given result
function createQueryBuilder(resolveWith: unknown): Record<string, unknown> {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => {
      trackCall(method, args);
      return builder;
    };
  }

  // Make builder thenable (so `await builder` works like `await supabase.from(...).select(...)...`)
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
  // First from() call = count query, second = data query
  if (fromCallIndex === 1) {
    return createQueryBuilder(countResult);
  }
  return createQueryBuilder(dataResult);
});

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import handler from '../api/alerts';

describe('GET /api/alerts', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  beforeEach(() => {
    fromCallIndex = 0;
    countResult = { count: 0, error: null };
    dataResult = { data: [], error: null };
    resetMethodCalls();

    mockReq = {
      method: 'GET',
      query: {},
    };

    mockRes = {
      status: vi.fn().mockImplementation((code) => {
        statusCode = code;
        return mockRes;
      }) as unknown as VercelResponse['status'],
      json: vi.fn().mockImplementation((data) => {
        responseData = data;
        return mockRes;
      }) as unknown as VercelResponse['json'],
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP method validation', () => {
    it('returns 405 for POST requests', async () => {
      mockReq.method = 'POST';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseData).toEqual({ success: false, error: 'Method not allowed' });
    });
  });

  describe('pagination', () => {
    it('returns correct pagination metadata', async () => {
      countResult = { count: 47, error: null };
      dataResult = { data: Array(25).fill({ id: 'test' }), error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { pagination: { page: number; limit: number; total: number; totalPages: number } };
      expect(response.pagination).toEqual({
        page: 1,
        limit: 25,
        total: 47,
        totalPages: 2,
      });
    });

    it('respects page and limit parameters', async () => {
      mockReq.query = { page: '2', limit: '10' };
      countResult = { count: 30, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { pagination: { page: number; limit: number; totalPages: number } };
      expect(response.pagination.page).toBe(2);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.totalPages).toBe(3);
    });

    it('clamps limit to max 100', async () => {
      mockReq.query = { limit: '500' };
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { pagination: { limit: number } };
      expect(response.pagination.limit).toBe(100);
    });

    it('defaults page to 1 and limit to 25', async () => {
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { pagination: { page: number; limit: number } };
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.limit).toBe(25);
    });
  });

  describe('filtering', () => {
    it('filters by symbol', async () => {
      mockReq.query = { symbol: 'ES' };
      countResult = { count: 5, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const eqCalls = methodCalls['eq'] ?? [];
      expect(eqCalls.some(([col, val]) => col === 'symbol' && val === 'ES')).toBe(true);
    });

    it('filters by action', async () => {
      mockReq.query = { action: 'buy' };
      countResult = { count: 3, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const eqCalls = methodCalls['eq'] ?? [];
      expect(eqCalls.some(([col, val]) => col === 'action' && val === 'buy')).toBe(true);
    });

    it('filters by status', async () => {
      mockReq.query = { status: 'executed' };
      countResult = { count: 10, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const eqCalls = methodCalls['eq'] ?? [];
      expect(eqCalls.some(([col, val]) => col === 'status' && val === 'executed')).toBe(true);
    });

    it('returns 400 for invalid action filter', async () => {
      mockReq.query = { action: 'invalid_action' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid action filter');
    });

    it('returns 400 for invalid status filter', async () => {
      mockReq.query = { status: 'invalid_status' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid status filter');
    });
  });

  describe('sorting', () => {
    it('sorts by column in ascending order', async () => {
      mockReq.query = { sort: 'symbol', order: 'asc' };
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const orderCalls = methodCalls['order'] ?? [];
      expect(orderCalls.some(([col, opts]) => {
        const o = opts as { ascending: boolean };
        return col === 'symbol' && o.ascending === true;
      })).toBe(true);
    });

    it('sorts by column in descending order', async () => {
      mockReq.query = { sort: 'price', order: 'desc' };
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const orderCalls = methodCalls['order'] ?? [];
      expect(orderCalls.some(([col, opts]) => {
        const o = opts as { ascending: boolean };
        return col === 'price' && o.ascending === false;
      })).toBe(true);
    });

    it('defaults sort to created_at desc', async () => {
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const orderCalls = methodCalls['order'] ?? [];
      expect(orderCalls.some(([col, opts]) => {
        const o = opts as { ascending: boolean };
        return col === 'created_at' && o.ascending === false;
      })).toBe(true);
    });

    it('returns 400 for invalid sort column', async () => {
      mockReq.query = { sort: 'invalid_column' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid sort column');
    });
  });

  describe('date range filtering', () => {
    it('filters by from date', async () => {
      mockReq.query = { from: '2026-01-01T00:00:00Z' };
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const gteCalls = methodCalls['gte'] ?? [];
      expect(gteCalls.some(([col, val]) => col === 'created_at' && val === '2026-01-01T00:00:00Z')).toBe(true);
    });

    it('filters by to date', async () => {
      mockReq.query = { to: '2026-12-31T23:59:59Z' };
      countResult = { count: 0, error: null };
      dataResult = { data: [], error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const lteCalls = methodCalls['lte'] ?? [];
      expect(lteCalls.some(([col, val]) => col === 'created_at' && val === '2026-12-31T23:59:59Z')).toBe(true);
    });

    it('returns 400 for invalid from date', async () => {
      mockReq.query = { from: 'not-a-date' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid from date');
    });

    it('returns 400 for invalid to date', async () => {
      mockReq.query = { to: 'not-a-date' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid to date');
    });
  });

  describe('database errors', () => {
    it('returns 500 on count query error', async () => {
      countResult = { count: null, error: { message: 'DB connection failed' } };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      expect((responseData as { error: string }).error).toBe('Database error');
    });

    it('returns 500 on data query error', async () => {
      countResult = { count: 10, error: null };
      dataResult = { data: null, error: { message: 'Query failed' } };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      expect((responseData as { error: string }).error).toBe('Database error');
    });
  });

  describe('response format', () => {
    it('returns success response with data and pagination', async () => {
      const mockAlerts = [
        { id: '1', symbol: 'ES', action: 'buy', status: 'received', created_at: '2026-02-11T10:00:00Z' },
        { id: '2', symbol: 'NQ', action: 'sell', status: 'executed', created_at: '2026-02-11T09:00:00Z' },
      ];

      countResult = { count: 2, error: null };
      dataResult = { data: mockAlerts, error: null };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { success: boolean; data: unknown[]; pagination: unknown };
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.pagination).toBeDefined();
    });
  });
});
