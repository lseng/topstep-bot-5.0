// E2E test suite for POST /api/webhook/informational endpoint
// Tests the full raw webhook flow: request -> auth -> store -> respond

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/webhook/informational';

vi.mock('../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSaveRawWebhook = vi.fn<() => Promise<string>>();
vi.mock('../../src/services/raw-webhook-storage', () => ({
  saveRawWebhook: (...args: unknown[]) => mockSaveRawWebhook(...args),
}));

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    query: { secret: 'e2e-test-secret' },
    body: 'BOS Bullish ES 5m',
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

describe('Informational Webhook E2E Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'e2e-test-secret';
    mockSaveRawWebhook.mockResolvedValue('e2e-info-uuid-001');
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Full Informational webhook flow', () => {
    it('stores raw payload and returns success with eventId', async () => {
      const req = createMockRequest({ body: 'BOS Bullish ES 5m' });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; eventId: string };
      expect(data.success).toBe(true);
      expect(data.eventId).toBe('e2e-info-uuid-001');
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
        source: 'informational',
        rawBody: 'BOS Bullish ES 5m',
        contentType: 'text/plain',
      });
    });

    it('rejects requests without valid secret', async () => {
      const req = createMockRequest({ query: { secret: 'wrong' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(401);
      expect((getData() as { success: boolean }).success).toBe(false);
      expect(mockSaveRawWebhook).not.toHaveBeenCalled();
    });

    it('handles text/plain content type', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'CHoCH Bearish NQ 15m',
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
        source: 'informational',
        rawBody: 'CHoCH Bearish NQ 15m',
        contentType: 'text/plain',
      });
    });

    it('handles application/json content type', async () => {
      const jsonBody = { type: 'FVG', direction: 'bullish', symbol: 'ES', timeframe: '5m' };
      const req = createMockRequest({
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
        source: 'informational',
        rawBody: JSON.stringify(jsonBody),
        contentType: 'application/json',
      });
    });

    it('handles arbitrary content types', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/csv' },
        body: 'ES,BOS,bullish,5m',
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
        source: 'informational',
        rawBody: 'ES,BOS,bullish,5m',
        contentType: 'text/csv',
      });
    });

    it('responds within 3 seconds', async () => {
      const req = createMockRequest();
      const { res } = createMockResponse();

      const start = performance.now();
      await handler(req, res);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(3000);
    });
  });
});
