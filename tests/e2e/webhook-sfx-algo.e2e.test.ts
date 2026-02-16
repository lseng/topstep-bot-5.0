// E2E test suite for POST /api/webhook/sfx-algo endpoint
// Tests the full webhook flow: request -> auth -> parse -> store -> respond

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

// Mock Supabase
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn(() => ({
  insert: mockInsert.mockReturnValue({
    select: mockSelect.mockReturnValue({
      single: mockSingle,
    }),
  }),
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: mockFrom,
  }),
}));

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    query: { secret: 'e2e-test-secret' },
    body: {
      algorithm: 'SFX',
      ticker: 'ES1!',
      alert: 'buy',
      signal_direction: 'bull',
      close: 6877.75,
      current_rating: '2',
      tp1: '6878',
      tp2: '6882.5',
      tp3: '6887',
      sl: '6859',
      unix_time: 1771230000000,
    },
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
    mockSingle.mockResolvedValue({ data: { id: 'e2e-sfx-uuid-001' }, error: null });
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Full SFX Algo webhook flow', () => {
    it('stores parsed SFX payload and returns success with eventId', async () => {
      const req = createMockRequest();
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = getData() as { success: boolean; eventId: string };
      expect(data.success).toBe(true);
      expect(data.eventId).toBe('e2e-sfx-uuid-001');

      expect(mockFrom).toHaveBeenCalledWith('sfx_algo_alerts');
      const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg.symbol).toBe('ES');
      expect(insertArg.alert_type).toBe('buy');
      expect(insertArg.signal_direction).toBe('bull');
      expect(insertArg.price).toBe(6877.75);
      expect(insertArg.tp1).toBe(6878);
      expect(insertArg.stop_loss).toBe(6859);
    });

    it('rejects requests without valid secret', async () => {
      const req = createMockRequest({ query: { secret: 'wrong' } });
      const { res, getStatus, getData } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(401);
      expect((getData() as { success: boolean }).success).toBe(false);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('handles plain text body (non-SFX) gracefully', async () => {
      const req = createMockRequest({
        headers: { 'content-type': 'text/plain' },
        body: 'raw pine script alert text',
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg.raw_body).toBe('raw pine script alert text');
      expect(insertArg.ticker).toBeNull();
      expect(insertArg.symbol).toBeNull();
    });

    it('handles SFX exit alerts (TP/SL)', async () => {
      const req = createMockRequest({
        body: {
          algorithm: 'SFX',
          ticker: 'NQ1!',
          alert: 'TP2',
          signal_direction: 'bear',
          close: 24600,
          entry_price: '24700',
          unix_time: 1771231000000,
        },
      });
      const { res, getStatus } = createMockResponse();

      await handler(req, res);

      expect(getStatus()).toBe(200);
      const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg.alert_type).toBe('TP2');
      expect(insertArg.entry_price).toBe(24700);
      expect(insertArg.tp1).toBeNull();
      expect(insertArg.stop_loss).toBeNull();
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
