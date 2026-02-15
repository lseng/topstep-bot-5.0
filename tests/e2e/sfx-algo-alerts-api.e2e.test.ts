// E2E test suite for GET /api/sfx-algo-alerts endpoint
// Tests the full retrieval flow: request -> filter -> query -> respond

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

import handler from '../../api/sfx-algo-alerts';

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

const SAMPLE_EVENTS = [
  {
    id: 'sfx-0001',
    created_at: '2026-02-15T10:00:00Z',
    source: 'sfx-algo',
    raw_body: 'S2 BUY ES 5800',
    content_type: 'text/plain',
  },
  {
    id: 'sfx-0002',
    created_at: '2026-02-15T09:00:00Z',
    source: 'sfx-algo',
    raw_body: 'S1 SELL NQ 20100',
    content_type: 'text/plain',
  },
];

describe('SFX Algo Alerts API E2E Tests', () => {
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

  describe('Full listing flow', () => {
    it('returns paginated results with default parameters', async () => {
      countResult = { count: 2, error: null };
      dataResult = { data: SAMPLE_EVENTS, error: null };

      const req = createMockRequest();
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: typeof SAMPLE_EVENTS;
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
      expect(mockFrom).toHaveBeenCalledWith('sfx_algo_alerts');
    });

    it('supports date range filter', async () => {
      countResult = { count: 1, error: null };
      dataResult = { data: [SAMPLE_EVENTS[0]], error: null };

      const req = createMockRequest({
        query: { from: '2026-02-15T09:30:00Z', to: '2026-02-15T11:00:00Z' },
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const gteCalls = methodCalls['gte'] ?? [];
      expect(gteCalls.some(([col]) => col === 'created_at')).toBe(true);
      const lteCalls = methodCalls['lte'] ?? [];
      expect(lteCalls.some(([col]) => col === 'created_at')).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('returns 405 for non-GET methods', async () => {
      const req = createMockRequest({ method: 'POST' });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(405);
    });

    it('returns 400 for invalid sort column', async () => {
      const req = createMockRequest({ query: { sort: 'nonexistent_column' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      expect((getData() as { success: boolean }).success).toBe(false);
    });
  });
});
