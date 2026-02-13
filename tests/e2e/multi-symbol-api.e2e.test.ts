// E2E test: API symbol filtering — verify /api/positions?symbol=MES returns only MES positions

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

import positionsHandler from '../../api/positions';
import tradesHandler from '../../api/trades-log';

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

  return {
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe('Multi-symbol API filtering (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMethodCalls();
    fromCallIndex = 0;
  });

  describe('/api/positions?symbol=MES', () => {
    it('filters positions by symbol when ?symbol=MES is provided', async () => {
      countResult = { count: 1, error: null };
      dataResult = {
        data: [
          {
            id: 'pos-1',
            symbol: 'MES',
            side: 'long',
            state: 'active',
            entry_price: 5020,
            quantity: 1,
            created_at: '2026-02-12T10:00:00Z',
            updated_at: '2026-02-12T10:00:00Z',
          },
        ],
        error: null,
      };

      const req = createMockRequest({ query: { symbol: 'MES' } });
      const { res, getStatus, getData } = createMockResponse();

      await positionsHandler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; data: unknown[] };
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);

      // Verify that .eq('symbol', 'MES') was called
      expect(methodCalls['eq']).toBeDefined();
      const symbolEqCalls = methodCalls['eq']?.filter(
        (args) => args[0] === 'symbol' && args[1] === 'MES',
      );
      expect(symbolEqCalls?.length).toBeGreaterThan(0);
    });

    it('returns all positions when no symbol filter', async () => {
      countResult = { count: 3, error: null };
      dataResult = {
        data: [
          { id: 'pos-1', symbol: 'MES', side: 'long', state: 'active' },
          { id: 'pos-2', symbol: 'MNQ', side: 'short', state: 'active' },
          { id: 'pos-3', symbol: 'MYM', side: 'long', state: 'closed' },
        ],
        error: null,
      };

      const req = createMockRequest({ query: {} });
      const { res, getStatus, getData } = createMockResponse();

      await positionsHandler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; data: unknown[] };
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);

      // Verify that .eq('symbol', ...) was NOT called
      const symbolEqCalls = methodCalls['eq']?.filter(
        (args) => args[0] === 'symbol',
      );
      expect(symbolEqCalls ?? []).toHaveLength(0);
    });
  });

  describe('/api/trades-log?symbol=MNQ', () => {
    it('filters trades by symbol when ?symbol=MNQ is provided', async () => {
      countResult = { count: 1, error: null };
      dataResult = {
        data: [
          {
            id: 'trade-1',
            symbol: 'MNQ',
            side: 'short',
            entry_price: 5080,
            exit_price: 5050,
            net_pnl: 60,
            created_at: '2026-02-12T10:00:00Z',
          },
        ],
        error: null,
      };

      const req = createMockRequest({ query: { symbol: 'MNQ' } });
      const { res, getStatus, getData } = createMockResponse();

      await tradesHandler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; data: unknown[] };
      expect(data.success).toBe(true);

      // Verify that .eq('symbol', 'MNQ') was called
      const symbolEqCalls = methodCalls['eq']?.filter(
        (args) => args[0] === 'symbol' && args[1] === 'MNQ',
      );
      expect(symbolEqCalls?.length).toBeGreaterThan(0);
    });
  });
});
