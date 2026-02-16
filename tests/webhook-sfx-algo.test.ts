import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/webhook/sfx-algo';

// Mock the logger
vi.mock('../src/lib/logger', () => ({
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

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => ({
    from: mockFrom,
  }),
}));

describe('webhook/sfx-algo handler', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  const sfxBuyPayload = {
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
    currency: 'USD',
    timeframe: '1',
    type: 'futures',
    timestamp: ' 2026-02-16T08:20:00+0000',
    ticker_full: { 'settlement-as-close': true, symbol: 'CME_MINI:ES1!' },
  };

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'test-secret-123';
    mockSingle.mockResolvedValue({ data: { id: 'test-event-id' }, error: null });

    mockReq = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      query: { secret: 'test-secret-123' },
      body: sfxBuyPayload,
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
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it('returns 405 for GET requests', async () => {
    mockReq.method = 'GET';
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(405);
    expect(responseData).toEqual({ success: false, error: 'Method not allowed' });
  });

  it('returns 401 for missing secret query param', async () => {
    mockReq.query = {};
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(401);
    expect(responseData).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 for invalid secret query param', async () => {
    mockReq.query = { secret: 'wrong-secret' };
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(401);
    expect(responseData).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('stores parsed SFX buy alert with all columns', async () => {
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect(responseData).toEqual({ success: true, eventId: 'test-event-id' });
    expect(mockFrom).toHaveBeenCalledWith('sfx_algo_alerts');

    const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.source).toBe('sfx-algo');
    expect(insertArg.ticker).toBe('ES1!');
    expect(insertArg.symbol).toBe('ES');
    expect(insertArg.alert_type).toBe('buy');
    expect(insertArg.signal_direction).toBe('bull');
    expect(insertArg.price).toBe(6877.75);
    expect(insertArg.current_rating).toBe(2);
    expect(insertArg.tp1).toBe(6878);
    expect(insertArg.tp2).toBe(6882.5);
    expect(insertArg.tp3).toBe(6887);
    expect(insertArg.stop_loss).toBe(6859);
    expect(insertArg.entry_price).toBeNull();
    expect(insertArg.unix_time).toBe(1771230000000);
  });

  it('stores parsed SFX TP1 exit alert', async () => {
    mockReq.body = {
      algorithm: 'SFX',
      ticker: 'NQ1!',
      alert: 'TP1',
      signal_direction: 'bull',
      close: 24800,
      entry_price: '24700',
      unix_time: 1771231000000,
    };
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.alert_type).toBe('TP1');
    expect(insertArg.symbol).toBe('NQ');
    expect(insertArg.entry_price).toBe(24700);
    expect(insertArg.tp1).toBeNull();
    expect(insertArg.stop_loss).toBeNull();
    expect(insertArg.current_rating).toBeNull();
  });

  it('handles non-SFX body gracefully (null parsed fields)', async () => {
    mockReq.body = 'plain text not SFX JSON';
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    const insertArg = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.raw_body).toBe('plain text not SFX JSON');
    expect(insertArg.ticker).toBeNull();
    expect(insertArg.symbol).toBeNull();
    expect(insertArg.alert_type).toBeNull();
  });

  it('response includes eventId', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'unique-uuid-abc' }, error: null });
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect((responseData as { eventId: string }).eventId).toBe('unique-uuid-abc');
  });

  it('returns 500 when storage fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB write failed' } });
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(500);
    expect(responseData).toEqual({ success: false, error: 'Storage error' });
  });
});
