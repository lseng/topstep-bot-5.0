// E2E test suite for POST /api/webhook/sfx-algo endpoint
// Tests the full raw webhook flow: request -> auth -> store -> respond

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/webhook/sfx-algo';

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
    body: 'S2 BUY ES 5800.25',
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

describe('SFX Algo Webhook E2E Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'e2e-test-secret';
    mockSaveRawWebhook.mockResolvedValue('e2e-sfx-uuid-001');
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Full SFX Algo webhook flow', () => {
    it('stores raw payload and returns success with eventId', async () => {
      const req = createMockRequest({ body: 'S2 BUY ES 5800.25 TP:5810 SL:5795' });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; eventId: string };
      expect(data.success).toBe(true);
      expect(data.eventId).toBe('e2e-sfx-uuid-001');
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('sfx_algo_alerts', {
        source: 'sfx-algo',
        rawBody: 'S2 BUY ES 5800.25 TP:5810 SL:5795',
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
        body: 'raw pine script alert text',
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('sfx_algo_alerts', {
        source: 'sfx-algo',
        rawBody: 'raw pine script alert text',
        contentType: 'text/plain',
      });
    });

    it('handles application/json content type', async () => {
      const jsonBody = { signal: 'S1', action: 'sell', price: 5800 };
      const req = createMockRequest({
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('sfx_algo_alerts', {
        source: 'sfx-algo',
        rawBody: JSON.stringify(jsonBody),
        contentType: 'application/json',
      });
    });

    it('handles arbitrary content types', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/csv' },
        body: 'ES,buy,1,5800.25',
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(mockSaveRawWebhook).toHaveBeenCalledWith('sfx_algo_alerts', {
        source: 'sfx-algo',
        rawBody: 'ES,buy,1,5800.25',
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
