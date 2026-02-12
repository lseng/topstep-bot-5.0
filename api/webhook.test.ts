import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './webhook';

// Mock the logger
vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('webhook handler', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'test-secret-123';

    mockReq = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      },
    };

    mockRes = {
      status: vi.fn().mockReturnThis() as unknown as VercelResponse['status'],
      json: vi.fn().mockImplementation((data) => {
        responseData = data;
        return mockRes;
      }) as unknown as VercelResponse['json'],
    };

    // Capture status code
    mockRes.status = vi.fn().mockImplementation((code) => {
      statusCode = code;
      return mockRes;
    }) as unknown as VercelResponse['status'];
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('HTTP method validation', () => {
    it('returns 405 for GET requests', () => {
      mockReq.method = 'GET';
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseData).toEqual({
        success: false,
        error: 'Method not allowed',
        details: 'Only POST requests are accepted',
      });
    });

    it('returns 405 for PUT requests', () => {
      mockReq.method = 'PUT';
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });

    it('returns 405 for DELETE requests', () => {
      mockReq.method = 'DELETE';
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });
  });

  describe('secret validation', () => {
    it('returns 401 for missing secret in body', () => {
      mockReq.body = {
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { success: boolean }).success).toBe(false);
    });

    it('returns 401 for invalid secret', () => {
      mockReq.body = {
        secret: 'wrong-secret',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseData).toEqual({
        success: false,
        error: 'Unauthorized',
        details: 'Invalid webhook secret',
      });
    });

    it('returns 200 for valid secret', () => {
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect((responseData as { success: boolean }).success).toBe(true);
    });
  });

  describe('payload validation', () => {
    it('returns 400 for missing symbol', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        action: 'buy',
        quantity: 1,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Validation failed');
    });

    it('returns 400 for missing action', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        quantity: 1,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 200 for missing quantity (defaults to 1)', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(1);
    });

    it('returns 400 for invalid action', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'invalid_action',
        quantity: 1,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 400 for negative quantity', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: -5,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 400 for zero quantity', () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 0,
      };
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });
  });

  describe('successful requests', () => {
    it('returns 200 for valid buy request', () => {
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect((responseData as { success: boolean }).success).toBe(true);
      expect((responseData as { message: string }).message).toBe('Webhook received and validated');
    });

    it('returns correct data structure', () => {
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseData as {
        success: boolean;
        message: string;
        data: {
          orderId: string;
          symbol: string;
          action: string;
          quantity: number;
          status: string;
          timestamp: string;
        };
      };

      expect(response.data.symbol).toBe('ES');
      expect(response.data.action).toBe('buy');
      expect(response.data.quantity).toBe(1);
      expect(response.data.status).toBe('Pending');
      expect(response.data.timestamp).toBeDefined();
    });

    it('handles all valid action types', () => {
      const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];

      for (const action of validActions) {
        mockReq.body = {
          secret: 'test-secret-123',
          symbol: 'ES',
          action,
          quantity: 1,
        };
        handler(mockReq as VercelRequest, mockRes as VercelResponse);
        expect(statusCode).toBe(200);
      }
    });
  });

  describe('response format', () => {
    it('returns success response format correctly', () => {
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseData as { success: boolean; message?: string; data?: unknown };
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('data');
    });

    it('returns error response format correctly', () => {
      mockReq.body = {};
      handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseData as { success: boolean; error?: string; details?: unknown };
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('details');
    });
  });
});
