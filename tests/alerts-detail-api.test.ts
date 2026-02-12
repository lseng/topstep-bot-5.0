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

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import handler from '../api/alerts/[id]';

describe('GET /api/alerts/[id]', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  beforeEach(() => {
    queryResult = { data: null, error: null };

    mockReq = {
      method: 'GET',
      query: { id: '550e8400-e29b-41d4-a716-446655440000' },
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

  describe('ID validation', () => {
    it('returns 400 for invalid UUID format', async () => {
      mockReq.query = { id: 'not-a-uuid' };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid alert ID format');
    });

    it('returns 400 for missing ID', async () => {
      mockReq.query = {};
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Invalid alert ID format');
    });
  });

  describe('alert retrieval', () => {
    it('returns full alert with OHLCV data from raw_payload', async () => {
      queryResult = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2026-02-11T10:00:00Z',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
          order_type: 'market',
          price: null,
          stop_loss: null,
          take_profit: null,
          comment: 'Test alert',
          status: 'received',
          error_message: null,
          order_id: null,
          executed_at: null,
          raw_payload: {
            secret: 'hidden',
            symbol: 'ES',
            action: 'buy',
            quantity: 1,
            open: 4850.25,
            high: 4853.00,
            low: 4849.75,
            close: 4852.50,
            volume: 12500,
          },
        },
        error: null,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        success: boolean;
        data: {
          id: string;
          ohlcv: { open: number; high: number; low: number; close: number; volume: number };
        };
      };
      expect(response.success).toBe(true);
      expect(response.data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(response.data.ohlcv).toEqual({
        open: 4850.25,
        high: 4853.00,
        low: 4849.75,
        close: 4852.50,
        volume: 12500,
      });
    });

    it('returns alert without ohlcv when raw_payload has no OHLCV fields', async () => {
      queryResult = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2026-02-11T10:00:00Z',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
          status: 'received',
          raw_payload: {
            secret: 'hidden',
            symbol: 'ES',
            action: 'buy',
          },
        },
        error: null,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        success: boolean;
        data: { ohlcv?: unknown };
      };
      expect(response.success).toBe(true);
      expect(response.data.ohlcv).toBeUndefined();
    });

    it('returns 404 for non-existent alert', async () => {
      queryResult = { data: null, error: { message: 'Not found', code: 'PGRST116' } };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect((responseData as { error: string }).error).toBe('Alert not found');
    });
  });

  describe('database errors', () => {
    it('returns 500 on thrown exception', async () => {
      mockFrom.mockImplementationOnce(() => {
        throw new Error('Connection refused');
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      expect((responseData as { error: string }).error).toBe('Internal server error');
    });
  });

  describe('partial OHLCV data', () => {
    it('handles raw_payload with only some OHLCV fields', async () => {
      queryResult = {
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          created_at: '2026-02-11T10:00:00Z',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
          status: 'received',
          raw_payload: {
            close: 4852.50,
            volume: 12500,
          },
        },
        error: null,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        data: {
          ohlcv: { open: number | null; high: number | null; low: number | null; close: number; volume: number };
        };
      };
      expect(response.data.ohlcv).toEqual({
        open: null,
        high: null,
        low: null,
        close: 4852.50,
        volume: 12500,
      });
    });
  });
});
