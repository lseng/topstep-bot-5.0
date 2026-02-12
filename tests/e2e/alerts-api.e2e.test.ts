// E2E test suite for GET /api/alerts endpoint
// Tests the full alert retrieval flow: request -> filter -> query -> respond

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

import handler from '../../api/alerts';

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

const SAMPLE_ALERTS = [
  {
    id: 'a1000000-0000-0000-0000-000000000001',
    created_at: '2026-02-11T10:00:00Z',
    symbol: 'ES',
    action: 'buy',
    quantity: 1,
    order_type: 'market',
    price: null,
    status: 'received',
    raw_payload: { secret: 'hidden', symbol: 'ES', action: 'buy', quantity: 1 },
  },
  {
    id: 'a1000000-0000-0000-0000-000000000002',
    created_at: '2026-02-11T09:00:00Z',
    symbol: 'NQ',
    action: 'sell',
    quantity: 2,
    order_type: 'limit',
    price: 17500.0,
    status: 'executed',
    raw_payload: { secret: 'hidden', symbol: 'NQ', action: 'sell', quantity: 2 },
  },
  {
    id: 'a1000000-0000-0000-0000-000000000003',
    created_at: '2026-02-11T08:00:00Z',
    symbol: 'ES',
    action: 'close',
    quantity: 1,
    order_type: 'market',
    price: null,
    status: 'failed',
    raw_payload: { secret: 'hidden', symbol: 'ES', action: 'close', quantity: 1 },
  },
];

describe('Alerts API E2E Tests', () => {
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

  describe('Full alerts listing flow', () => {
    it('returns paginated alerts list with default parameters', async () => {
      countResult = { count: 3, error: null };
      dataResult = { data: SAMPLE_ALERTS, error: null };

      const req = createMockRequest();
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: typeof SAMPLE_ALERTS;
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.pagination).toEqual({
        page: 1,
        limit: 25,
        total: 3,
        totalPages: 1,
      });
    });

    it('returns page 2 of paginated results', async () => {
      countResult = { count: 30, error: null };
      dataResult = { data: SAMPLE_ALERTS.slice(0, 1), error: null };

      const req = createMockRequest({ query: { page: '2', limit: '10' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };

      expect(data.pagination.page).toBe(2);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.total).toBe(30);
      expect(data.pagination.totalPages).toBe(3);
    });
  });

  describe('Filtering flow', () => {
    it('filters by symbol and returns only matching alerts', async () => {
      const esAlerts = SAMPLE_ALERTS.filter((a) => a.symbol === 'ES');
      countResult = { count: esAlerts.length, error: null };
      dataResult = { data: esAlerts, error: null };

      const req = createMockRequest({ query: { symbol: 'ES' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { data: typeof SAMPLE_ALERTS; pagination: { total: number } };
      expect(data.data).toHaveLength(2);
      expect(data.pagination.total).toBe(2);
      const eqCalls = methodCalls['eq'] ?? [];
      expect(eqCalls.some(([col, val]) => col === 'symbol' && val === 'ES')).toBe(true);
    });

    it('filters by status and returns only matching alerts', async () => {
      const executedAlerts = SAMPLE_ALERTS.filter((a) => a.status === 'executed');
      countResult = { count: executedAlerts.length, error: null };
      dataResult = { data: executedAlerts, error: null };

      const req = createMockRequest({ query: { status: 'executed' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { data: typeof SAMPLE_ALERTS };
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe('executed');
    });

    it('combines multiple filters', async () => {
      countResult = { count: 1, error: null };
      dataResult = { data: [SAMPLE_ALERTS[0]], error: null };

      const req = createMockRequest({ query: { symbol: 'ES', action: 'buy', status: 'received' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { data: typeof SAMPLE_ALERTS };
      expect(data.data).toHaveLength(1);
    });
  });

  describe('Sorting flow', () => {
    it('sorts by symbol ascending', async () => {
      const sorted = [...SAMPLE_ALERTS].sort((a, b) => a.symbol.localeCompare(b.symbol));
      countResult = { count: sorted.length, error: null };
      dataResult = { data: sorted, error: null };

      const req = createMockRequest({ query: { sort: 'symbol', order: 'asc' } });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const orderCalls = methodCalls['order'] ?? [];
      expect(orderCalls.some(([col, opts]) => {
        const o = opts as { ascending: boolean };
        return col === 'symbol' && o.ascending === true;
      })).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('returns 400 for invalid query parameters', async () => {
      const req = createMockRequest({ query: { sort: 'nonexistent_column' } });
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
});
