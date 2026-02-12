// E2E test suite for the webhook endpoint
// Tests the full webhook flow: request -> parse -> validate -> store -> respond

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/webhook';

// Mock the logger to keep test output clean
vi.mock('../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the database module - E2E tests verify the full flow with storage
const mockIsDatabaseConfigured = vi.fn<() => boolean>();
vi.mock('../../src/lib/db', () => ({
  isDatabaseConfigured: () => mockIsDatabaseConfigured(),
}));

const mockSaveAlert = vi.fn<() => Promise<string>>();
vi.mock('../../src/services/alert-storage', () => ({
  saveAlert: (...args: unknown[]) => mockSaveAlert(...args),
}));

/**
 * Helper to create a mock Vercel request
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {},
    ...overrides,
  } as VercelRequest;
}

/**
 * Helper to create a mock Vercel response that captures output
 */
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

describe('Webhook E2E Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'e2e-test-secret';
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockSaveAlert.mockResolvedValue('e2e-alert-uuid-001');
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Full TradingView JSON webhook flow', () => {
    it('processes a complete TradingView alert with all OHLCV fields and saves to database', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
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
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      // Verify success response
      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        message: string;
        data: {
          alertId: string;
          symbol: string;
          action: string;
          quantity: number;
          status: string;
          timestamp: string;
        };
        tradingViewData: {
          interval: string;
          alertTime: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      expect(data.success).toBe(true);
      expect(data.message).toBe('Webhook received and validated');

      // Verify core trade data
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);
      expect(data.data.status).toBe('Pending');
      expect(data.data.timestamp).toBeDefined();

      // Verify alertId comes from database save
      expect(data.data.alertId).toBe('e2e-alert-uuid-001');

      // Verify TradingView-specific data in response
      expect(data.tradingViewData).toBeDefined();
      expect(data.tradingViewData.interval).toBe('5');
      expect(data.tradingViewData.alertTime).toBe('2026-02-11T10:30:00.000Z');
      expect(data.tradingViewData.ohlcv).toEqual({
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      });

      // Verify the alert was saved to database
      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.symbol).toBe('ES');
      expect(savedPayload.action).toBe('buy');
      expect(savedPayload.quantity).toBe(1);
      expect(savedPayload.interval).toBe('5');
      expect(savedPayload.ohlcv).toEqual({
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      });
    });

    it('processes a sell alert with ticker mapped to symbol', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'sell',
          ticker: 'nq',
          interval: '15',
          time: '2026-02-11T14:00:00Z',
          open: 17500.00,
          close: 17480.25,
          high: 17510.50,
          low: 17475.00,
          volume: 8500,
          quantity: 2,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { symbol: string; action: string; quantity: number; alertId: string };
        tradingViewData: {
          interval: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      // Verify ticker mapped to uppercase symbol
      expect(data.data.symbol).toBe('NQ');
      expect(data.data.action).toBe('sell');
      expect(data.data.quantity).toBe(2);
      expect(data.data.alertId).toBe('e2e-alert-uuid-001');

      // Verify OHLCV stored correctly
      expect(data.tradingViewData.ohlcv).toEqual({
        open: 17500.00,
        close: 17480.25,
        high: 17510.50,
        low: 17475.00,
        volume: 8500,
      });

      // Verify database save was called with correct data
      expect(mockSaveAlert).toHaveBeenCalledOnce();
    });

    it('processes alert with default quantity of 1 when not provided', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'buy',
          ticker: 'MES',
          open: 4850.00,
          close: 4851.00,
          high: 4852.00,
          low: 4849.00,
          volume: 5000,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { data: { quantity: number } };
      expect(data.data.quantity).toBe(1);

      // Verify default quantity passed to storage
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.quantity).toBe(1);
    });
  });

  describe('Full CSV webhook flow', () => {
    it('processes a complete CSV payload with all fields', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'e2e-test-secret, buy, ES, 5, 2026-02-11T10:30:00Z, 4850.25, 4852.50, 4853.00, 4849.75, 12500, 1',
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { symbol: string; action: string; quantity: number; alertId: string };
        tradingViewData: {
          interval: string;
          alertTime: string;
          ohlcv: { open: number; close: number; high: number; low: number; volume: number };
        };
      };

      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);
      expect(data.data.alertId).toBe('e2e-alert-uuid-001');

      // Verify OHLCV parsed from CSV
      expect(data.tradingViewData.ohlcv).toEqual({
        open: 4850.25,
        close: 4852.50,
        high: 4853.00,
        low: 4849.75,
        volume: 12500,
      });

      // Verify database save
      expect(mockSaveAlert).toHaveBeenCalledOnce();
    });

    it('processes a minimal CSV payload with only required fields', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'e2e-test-secret, sell, MNQ',
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { symbol: string; action: string; quantity: number };
      };

      expect(data.data.symbol).toBe('MNQ');
      expect(data.data.action).toBe('sell');
      expect(data.data.quantity).toBe(1);
    });
  });

  describe('OHLCV data persistence verification', () => {
    it('saves complete OHLCV data to database through saveAlert', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
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
        },
      });
      const { res } = createMockResponse();

      await handler(req, res);

      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];

      // Verify all OHLCV fields are passed to the storage layer
      expect(savedPayload.ohlcv).toBeDefined();
      expect(savedPayload.ohlcv.open).toBe(4850.25);
      expect(savedPayload.ohlcv.high).toBe(4853.00);
      expect(savedPayload.ohlcv.low).toBe(4849.75);
      expect(savedPayload.ohlcv.close).toBe(4852.50);
      expect(savedPayload.ohlcv.volume).toBe(12500);

      // Verify metadata
      expect(savedPayload.interval).toBe('5');
      expect(savedPayload.alertTime).toBeInstanceOf(Date);
      expect(savedPayload.alertTime.toISOString()).toBe('2026-02-11T10:30:00.000Z');
    });

    it('saves CSV-sourced OHLCV data to database', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'e2e-test-secret, buy, NQ, 15, 2026-02-11T12:00:00Z, 17500.00, 17550.00, 17560.00, 17490.00, 25000, 3',
      });
      const { res } = createMockResponse();

      await handler(req, res);

      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];

      expect(savedPayload.symbol).toBe('NQ');
      expect(savedPayload.quantity).toBe(3);
      expect(savedPayload.interval).toBe('15');
      expect(savedPayload.ohlcv).toEqual({
        open: 17500.00,
        close: 17550.00,
        high: 17560.00,
        low: 17490.00,
        volume: 25000,
      });
    });

    it('handles alert without OHLCV data - saves with null OHLCV fields', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'buy',
          symbol: 'ES',
          quantity: 1,
        },
      });
      const { res } = createMockResponse();

      await handler(req, res);

      expect(mockSaveAlert).toHaveBeenCalledOnce();
      const savedPayload = mockSaveAlert.mock.calls[0][0];
      expect(savedPayload.ohlcv).toBeUndefined();
    });
  });

  describe('Response time verification', () => {
    it('responds within 3 seconds for JSON payload with database save', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
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
        },
      });
      const { res, getStatus } = createMockResponse();

      const start = performance.now();
      await handler(req, res);
      const elapsed = performance.now() - start;

      expect(getStatus()).toBe(200);
      // Must respond within 3 seconds (TradingView timeout)
      expect(elapsed).toBeLessThan(3000);
    });

    it('responds within 3 seconds for CSV payload with database save', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'e2e-test-secret, buy, ES, 5, 2026-02-11T10:30:00Z, 4850.25, 4852.50, 4853.00, 4849.75, 12500, 1',
      });
      const { res, getStatus } = createMockResponse();

      const start = performance.now();
      await handler(req, res);
      const elapsed = performance.now() - start;

      expect(getStatus()).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('Error handling in full flow', () => {
    it('rejects invalid secret before reaching database', async () => {
      const req = createMockRequest({
        body: {
          secret: 'wrong-secret',
          action: 'buy',
          ticker: 'ES',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(401);
      expect((getData() as { success: boolean }).success).toBe(false);
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('rejects invalid action in TradingView format', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'hold',
          ticker: 'ES',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(400);
      expect((getData() as { success: boolean }).success).toBe(false);
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });

    it('returns 500 when database save fails', async () => {
      mockSaveAlert.mockRejectedValue(new Error('Connection timeout'));

      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'buy',
          ticker: 'ES',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(500);
      const data = getData() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Storage error');
    });

    it('succeeds without database when not configured', async () => {
      mockIsDatabaseConfigured.mockReturnValue(false);

      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          action: 'buy',
          ticker: 'ES',
          open: 4850.25,
          close: 4852.50,
          high: 4853.00,
          low: 4849.75,
          volume: 12500,
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { data: { alertId?: string } };
      expect(data.data.alertId).toBeUndefined();
      expect(mockSaveAlert).not.toHaveBeenCalled();
    });
  });

  describe('Backward compatibility', () => {
    it('still accepts the original webhook format with symbol field', async () => {
      const req = createMockRequest({
        body: {
          secret: 'e2e-test-secret',
          symbol: 'ES',
          action: 'buy',
          quantity: 1,
        },
      });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as {
        success: boolean;
        data: { symbol: string; action: string; quantity: number };
      };
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('ES');
      expect(data.data.action).toBe('buy');
      expect(data.data.quantity).toBe(1);
    });

    it('original format with all trade actions still works', async () => {
      const actions = ['buy', 'sell', 'close', 'close_long', 'close_short'];

      for (const action of actions) {
        vi.clearAllMocks();
        mockIsDatabaseConfigured.mockReturnValue(true);
        mockSaveAlert.mockResolvedValue(`alert-${action}`);

        const req = createMockRequest({
          body: {
            secret: 'e2e-test-secret',
            symbol: 'ES',
            action,
            quantity: 1,
          },
        });
        const { res, getStatus } = createMockResponse();

        await handler(req, res);
        expect(getStatus()).toBe(200);
      }
    });
  });
});
