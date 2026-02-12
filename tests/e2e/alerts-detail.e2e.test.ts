// E2E test suite for GET /api/alerts/[id] endpoint
// Tests alert detail retrieval with OHLCV extraction from raw_payload

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let queryResult: unknown;

// Create a thenable query builder
function createQueryBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'single']) {
    builder[method] = () => builder;
  }

  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    return Promise.resolve(queryResult).then(resolve, reject);
  };

  return builder;
}

const mockFrom = vi.fn(() => createQueryBuilder());

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import handler from '../../api/alerts/[id]';

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {},
    query: { id: '550e8400-e29b-41d4-a716-446655440000' },
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

describe('Alert Detail E2E Tests', () => {
  beforeEach(() => {
    queryResult = { data: null, error: null };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full alert detail retrieval with OHLCV', () => {
    it('returns complete alert with OHLCV data extracted from raw_payload', async () => {
      queryResult = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2026-02-11T10:30:00Z',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
          order_type: 'market',
          price: null,
          stop_loss: null,
          take_profit: null,
          comment: 'Technical breakout',
          status: 'received',
          error_message: null,
          order_id: null,
          executed_at: null,
          raw_payload: {
            secret: 'hidden',
            ticker: 'ES',
            action: 'buy',
            quantity: 1,
            interval: '5',
            time: '2026-02-11T10:30:00Z',
            open: 4850.25,
            high: 4853.00,
            low: 4849.75,
            close: 4852.50,
            volume: 12500,
          },
        },
        error: null,
      };

      const req = createMockRequest();
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: {
          id: string;
          symbol: string;
          comment: string;
          raw_payload: Record<string, unknown>;
          ohlcv: { open: number; high: number; low: number; close: number; volume: number };
        };
      };

      expect(data.success).toBe(true);
      expect(data.data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(data.data.symbol).toBe('ES');
      expect(data.data.comment).toBe('Technical breakout');

      expect(data.data.ohlcv).toEqual({
        open: 4850.25,
        high: 4853.00,
        low: 4849.75,
        close: 4852.50,
        volume: 12500,
      });

      expect(data.data.raw_payload).toBeDefined();
    });
  });

  describe('Alert without OHLCV data', () => {
    it('returns alert without ohlcv field when raw_payload has no OHLCV', async () => {
      queryResult = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2026-02-11T10:30:00Z',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
          status: 'received',
          raw_payload: {
            secret: 'hidden',
            symbol: 'ES',
            action: 'buy',
            quantity: 1,
          },
        },
        error: null,
      };

      const req = createMockRequest();
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; data: { ohlcv?: unknown } };
      expect(data.success).toBe(true);
      expect(data.data.ohlcv).toBeUndefined();
    });
  });

  describe('Non-existent alert', () => {
    it('returns 404 for a valid UUID that does not exist', async () => {
      queryResult = { data: null, error: { message: 'Not found', code: 'PGRST116' } };

      const req = createMockRequest({
        query: { id: '00000000-0000-0000-0000-000000000000' },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(404);
      expect((getData() as { error: string }).error).toBe('Alert not found');
    });
  });

  describe('Invalid ID format', () => {
    it('returns 400 for non-UUID string', async () => {
      const req = createMockRequest({ query: { id: 'abc-123' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      expect((getData() as { error: string }).error).toBe('Invalid alert ID format');
    });

    it('returns 400 for numeric ID', async () => {
      const req = createMockRequest({ query: { id: '12345' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
    });
  });
});
