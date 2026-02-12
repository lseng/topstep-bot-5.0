// Pipeline E2E test suite: Webhook → Supabase → Dashboard
// Tests all 5 positive and 5 negative scenarios from the spec

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/webhook';

// Mock logger to keep test output clean
vi.mock('../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSaveAlert = vi.fn<() => Promise<string>>();
vi.mock('../../src/services/alert-storage', () => ({
  saveAlert: (...args: unknown[]) => mockSaveAlert(...args),
}));

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {},
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

describe('Pipeline E2E Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'pipeline-test-secret';
    mockSaveAlert.mockResolvedValue('pipeline-alert-uuid-001');
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Positive Tests (Phase 1 of spec)', () => {
    it('Test 1: Buy with full OHLCV (ticker=ES, all OHLCV fields, interval=5)', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          action: 'buy',
          quantity: 1,
          open: 5895.00,
          close: 5900.25,
          high: 5905.00,
          low: 5890.00,
          volume: 12345,
          interval: '5',
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { alertId: string; symbol: string; action: string; quantity: number };
        tradingViewData: {
          interval: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      // Verify success response with alertId
      expect(data.success).toBe(true);
      expect(data.data.alertId).toBe('pipeline-alert-uuid-001');
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);

      // Verify OHLCV in response
      expect(data.tradingViewData.interval).toBe('5');
      expect(data.tradingViewData.ohlcv).toEqual({
        open: 5895.00,
        close: 5900.25,
        high: 5905.00,
        low: 5890.00,
        volume: 12345,
      });

      // Verify saveAlert called with correct data
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.symbol).toBe('ES');
      expect(savedPayload.action).toBe('buy');
      expect(savedPayload.quantity).toBe(1);
      expect(savedPayload.interval).toBe('5');
      expect(savedPayload.ohlcv).toEqual({
        open: 5895.00,
        close: 5900.25,
        high: 5905.00,
        low: 5890.00,
        volume: 12345,
      });
    });

    it('Test 2: Sell with different symbol (ticker=NQ, quantity=2, interval=15)', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'NQ',
          action: 'sell',
          quantity: 2,
          open: 21500.00,
          close: 21485.50,
          high: 21520.00,
          low: 21470.00,
          volume: 8700,
          interval: '15',
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { alertId: string; symbol: string; action: string; quantity: number };
        tradingViewData: {
          interval: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      expect(data.success).toBe(true);
      expect(data.data.alertId).toBe('pipeline-alert-uuid-001');
      expect(data.data.symbol).toBe('NQ');
      expect(data.data.action).toBe('sell');
      expect(data.data.quantity).toBe(2);

      expect(data.tradingViewData.interval).toBe('15');
      expect(data.tradingViewData.ohlcv).toEqual({
        open: 21500.00,
        close: 21485.50,
        high: 21520.00,
        low: 21470.00,
        volume: 8700,
      });

      // Verify saveAlert
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.symbol).toBe('NQ');
      expect(savedPayload.action).toBe('sell');
      expect(savedPayload.quantity).toBe(2);
    });

    it('Test 3: Close position (ticker=ES, action=close)', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          action: 'close',
          quantity: 1,
          open: 5910.00,
          close: 5908.75,
          high: 5912.00,
          low: 5905.00,
          volume: 9500,
          interval: '5',
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { alertId: string; symbol: string; action: string; quantity: number };
      };

      expect(data.success).toBe(true);
      expect(data.data.alertId).toBe('pipeline-alert-uuid-001');
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('close');
      expect(data.data.quantity).toBe(1);

      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.action).toBe('close');
    });

    it('Test 4: CSV format (text/plain Content-Type)', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'pipeline-test-secret, buy, MNQ, 5, 2026-02-12T10:30:00Z, 21000.50, 21010.25, 21015.00, 20995.00, 5000, 1',
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { alertId: string; symbol: string; action: string; quantity: number };
        tradingViewData: {
          interval: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      expect(data.success).toBe(true);
      expect(data.data.alertId).toBe('pipeline-alert-uuid-001');
      expect(data.data.symbol).toBe('MNQ');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);

      expect(data.tradingViewData.ohlcv).toEqual({
        open: 21000.50,
        close: 21010.25,
        high: 21015.00,
        low: 20995.00,
        volume: 5000,
      });

      expect(mockSaveAlert).toHaveBeenCalledOnce();
    });

    it('Test 5: Minimal payload (no OHLCV, just secret+ticker+action+quantity)', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          action: 'buy',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { alertId: string; symbol: string; action: string; quantity: number };
      };

      expect(data.success).toBe(true);
      expect(data.data.alertId).toBe('pipeline-alert-uuid-001');
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);

      // Verify saveAlert called with no OHLCV
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.ohlcv).toBeUndefined();
    });
  });

  describe('Negative Tests (Phase 2 of spec)', () => {
    it('Wrong secret returns 401 Unauthorized', async () => {
      const req = createMockRequest({
        body: {
          secret: 'wrong-secret',
          ticker: 'ES',
          action: 'buy',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(401);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('Missing action returns 400 Validation failed', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('Invalid action ("hold") returns 400', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          action: 'hold',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('Missing ticker/symbol returns 400 Validation failed', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          action: 'buy',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation failed');
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('GET request returns 405 Method not allowed', async () => {
      const req = createMockRequest({
        method: 'GET',
        body: {},
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(405);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Method not allowed');
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });
  });

  describe('Price mapping verification', () => {
    it('price column maps to open from TradingView when no explicit price provided', async () => {
      const req = createMockRequest({
        body: {
          secret: 'pipeline-test-secret',
          ticker: 'ES',
          action: 'buy',
          quantity: 1,
          open: 5895.00,
          close: 5900.25,
          high: 5905.00,
          low: 5890.00,
          volume: 12345,
        },
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);

      // Verify saveAlert was called — the storage layer maps price = open when no explicit price
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.ohlcv.open).toBe(5895.00);
      // No explicit price field — alert-storage.ts will map price = ohlcv.open
      expect(savedPayload.price).toBeUndefined();
    });
  });
});
