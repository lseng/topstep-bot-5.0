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

// Mock the database module
const mockIsDatabaseConfigured = vi.fn<() => boolean>();
vi.mock('../src/lib/db', () => ({
  isDatabaseConfigured: () => mockIsDatabaseConfigured(),
}));

// Mock the alert storage module
const mockSaveAlert = vi.fn<() => Promise<string>>();
vi.mock('../src/services/alert-storage', () => ({
  saveAlert: (...args: unknown[]) => mockSaveAlert(...args),
}));

describe('webhook handler', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'test-secret-123';

    // Default: database not configured (preserves existing test behavior)
    mockIsDatabaseConfigured.mockReturnValue(false);
    mockSaveAlert.mockResolvedValue('test-alert-id');

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
    it('returns 405 for GET requests', async () => {
      mockReq.method = 'GET';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseData).toEqual({
        success: false,
        error: 'Method not allowed',
        details: 'Only POST requests are accepted',
      });
    });

    it('returns 405 for PUT requests', async () => {
      mockReq.method = 'PUT';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });

    it('returns 405 for DELETE requests', async () => {
      mockReq.method = 'DELETE';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
    });
  });

  describe('secret validation', () => {
    it('returns 401 for missing secret in body', async () => {
      mockReq.body = {
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { success: boolean }).success).toBe(false);
    });

    it('returns 401 for invalid secret', async () => {
      mockReq.body = {
        secret: 'wrong-secret',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseData).toEqual({
        success: false,
        error: 'Unauthorized',
        details: 'Invalid webhook secret',
      });
    });

    it('returns 200 for valid secret', async () => {
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect((responseData as { success: boolean }).success).toBe(true);
    });
  });

  describe('payload validation', () => {
    it('returns 400 for missing symbol', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        action: 'buy',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect((responseData as { error: string }).error).toBe('Validation failed');
    });

    it('returns 400 for missing action', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 200 for missing quantity (defaults to 1)', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(1);
    });

    it('returns 400 for invalid action', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'invalid_action',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 400 for negative quantity', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: -5,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 400 for zero quantity', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 0,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });
  });

  describe('successful requests', () => {
    it('returns 200 for valid buy request', async () => {
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect((responseData as { success: boolean }).success).toBe(true);
      expect((responseData as { message: string }).message).toBe('Webhook received and validated');
    });

    it('returns correct data structure', async () => {
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

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

    it('handles all valid action types', async () => {
      const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];

      for (const action of validActions) {
        mockReq.body = {
          secret: 'test-secret-123',
          symbol: 'ES',
          action,
          quantity: 1,
        };
        await handler(mockReq as VercelRequest, mockRes as VercelResponse);
        expect(statusCode).toBe(200);
      }
    });
  });

  describe('response format', () => {
    it('returns success response format correctly', async () => {
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseData as { success: boolean; message?: string; data?: unknown };
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('data');
    });

    it('returns error response format correctly', async () => {
      mockReq.body = {};
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      const response = responseData as { success: boolean; error?: string; details?: unknown };
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('details');
    });
  });

  describe('TradingView JSON format', () => {
    it('accepts ticker field instead of symbol', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'NQ',
        action: 'buy',
        quantity: 2,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { symbol: string } };
      expect(response.data.symbol).toBe('NQ');
    });

    it('handles all TradingView placeholder fields', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        action: 'buy',
        ticker: 'ES',
        interval: '5',
        time: '2026-02-11T10:30:00Z',
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        success: boolean;
        data: { symbol: string; action: string };
        tradingViewData?: {
          interval: string;
          alertTime: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };
      expect(response.success).toBe(true);
      expect(response.data.symbol).toBe('ES');
      expect(response.tradingViewData).toBeDefined();
      expect(response.tradingViewData?.interval).toBe('5');
      expect(response.tradingViewData?.alertTime).toBe('2026-02-11T10:30:00.000Z');
      expect(response.tradingViewData?.ohlcv).toEqual({
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      });
    });

    it('normalizes ticker to uppercase symbol', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'mes',
        action: 'sell',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { symbol: string } };
      expect(response.data.symbol).toBe('MES');
    });

    it('handles partial OHLCV data', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'ES',
        action: 'buy',
        close: 4852.50,
        volume: 12500,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: {
          ohlcv: { close: number; volume: number };
        };
      };
      expect(response.tradingViewData?.ohlcv).toEqual({
        close: 4852.50,
        volume: 12500,
      });
    });

    it('includes interval in response when provided', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'ES',
        action: 'buy',
        interval: '15',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: { interval: string };
      };
      expect(response.tradingViewData?.interval).toBe('15');
    });

    it('handles daily interval format', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'ES',
        action: 'buy',
        interval: 'D',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: { interval: string };
      };
      expect(response.tradingViewData?.interval).toBe('D');
    });
  });

  describe('Content-Type handling', () => {
    it('parses application/json content type as JSON', async () => {
      mockReq.headers = { 'content-type': 'application/json' };
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
    });

    it('parses text/plain content type as CSV', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'test-secret-123, buy, ES, 5, 2026-02-11T10:30:00Z, 4850.25, 4852.50, 4853.00, 4849.75, 12500, 1';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { symbol: string; action: string; quantity: number } };
      expect(response.data.symbol).toBe('ES');
      expect(response.data.action).toBe('buy');
      expect(response.data.quantity).toBe(1);
    });

    it('handles text/plain CSV with OHLCV data in response', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'test-secret-123, buy, NQ, 15, 2026-02-11T12:00:00Z, 17500.00, 17550.00, 17560.00, 17490.00, 25000, 2';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        data: { symbol: string; quantity: number };
        tradingViewData?: {
          interval: string;
          alertTime: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };
      expect(response.data.symbol).toBe('NQ');
      expect(response.data.quantity).toBe(2);
      expect(response.tradingViewData?.interval).toBe('15');
      expect(response.tradingViewData?.ohlcv).toEqual({
        open: 17500.00,
        close: 17550.00,
        high: 17560.00,
        low: 17490.00,
        volume: 25000,
      });
    });

    it('handles text/plain with minimal CSV fields', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'test-secret-123, sell, MES';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { symbol: string; action: string; quantity: number } };
      expect(response.data.symbol).toBe('MES');
      expect(response.data.action).toBe('sell');
      expect(response.data.quantity).toBe(1); // Defaults to 1
    });

    it('returns 400 for invalid CSV format in text/plain', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'invalid-csv-no-commas';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('returns 400 for empty text/plain body', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = '';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
    });

    it('validates secret in CSV format', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'wrong-secret, buy, ES';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
    });
  });

  describe('OHLCV data in response', () => {
    it('includes tradingViewData when OHLCV is present', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
        open: 100.5,
        high: 101.0,
        low: 100.0,
        close: 100.75,
        volume: 1000,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: {
          ohlcv: { open: number; high: number; low: number; close: number; volume: number };
        };
      };
      expect(response.tradingViewData).toBeDefined();
      expect(response.tradingViewData?.ohlcv).toEqual({
        open: 100.5,
        high: 101.0,
        low: 100.0,
        close: 100.75,
        volume: 1000,
      });
    });

    it('includes tradingViewData when interval is present', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
        interval: '60',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: { interval: string };
      };
      expect(response.tradingViewData?.interval).toBe('60');
    });

    it('includes tradingViewData when alertTime is present', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
        time: '2026-02-11T15:00:00Z',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as {
        tradingViewData?: { alertTime: string };
      };
      expect(response.tradingViewData?.alertTime).toBe('2026-02-11T15:00:00.000Z');
    });

    it('does not include tradingViewData when no TradingView-specific fields', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { tradingViewData?: unknown };
      expect(response.tradingViewData).toBeUndefined();
    });
  });

  describe('quantity default behavior', () => {
    it('defaults quantity to 1 when not provided in JSON', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(1);
    });

    it('defaults quantity to 1 when not provided with ticker', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'NQ',
        action: 'sell',
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(1);
    });

    it('defaults quantity to 1 in CSV format', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'test-secret-123, buy, ES';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(1);
    });

    it('uses provided quantity when specified', async () => {
      mockReq.body = {
        secret: 'test-secret-123',
        symbol: 'ES',
        action: 'buy',
        quantity: 5,
      };
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(5);
    });

    it('uses provided quantity in CSV format', async () => {
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.body = 'test-secret-123, buy, ES, 5, 2026-02-11T10:30:00Z, 100, 101, 102, 99, 1000, 10';
      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      const response = responseData as { data: { quantity: number } };
      expect(response.data.quantity).toBe(10);
    });
  });

  describe('database storage integration', () => {
    it('saves alert to database when configured', async () => {
      mockIsDatabaseConfigured.mockReturnValue(true);
      mockSaveAlert.mockResolvedValue('abc-123-uuid');

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const response = responseData as { data: { alertId: string } };
      expect(response.data.alertId).toBe('abc-123-uuid');
    });

    it('does not save to database when not configured', async () => {
      mockIsDatabaseConfigured.mockReturnValue(false);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(mockSaveAlert).not.toHaveBeenCalled();
      const response = responseData as { data: { alertId?: string } };
      expect(response.data.alertId).toBeUndefined();
    });

    it('returns 500 when database save fails', async () => {
      mockIsDatabaseConfigured.mockReturnValue(true);
      mockSaveAlert.mockRejectedValue(new Error('Connection refused'));

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(500);
      const response = responseData as { success: boolean; error: string; details: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('Storage error');
      expect(response.details).toBe('Failed to persist alert');
    });

    it('passes correct payload to saveAlert', async () => {
      mockIsDatabaseConfigured.mockReturnValue(true);
      mockSaveAlert.mockResolvedValue('test-id');

      mockReq.body = {
        secret: 'test-secret-123',
        ticker: 'NQ',
        action: 'buy',
        quantity: 3,
        interval: '5',
        time: '2026-02-11T10:30:00Z',
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.symbol).toBe('NQ');
      expect(savedPayload.action).toBe('buy');
      expect(savedPayload.quantity).toBe(3);
      expect(savedPayload.interval).toBe('5');
      expect(savedPayload.ohlcv).toEqual({
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      });
    });

    it('does not call saveAlert before secret validation', async () => {
      mockIsDatabaseConfigured.mockReturnValue(true);
      mockReq.body = {
        secret: 'wrong-secret',
        symbol: 'ES',
        action: 'buy',
        quantity: 1,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });
  });
});
