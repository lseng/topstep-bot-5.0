import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/webhook/informational';

// Mock the logger
vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the raw webhook storage
const mockSaveRawWebhook = vi.fn<() => Promise<string>>();
vi.mock('../src/services/raw-webhook-storage', () => ({
  saveRawWebhook: (...args: unknown[]) => mockSaveRawWebhook(...args),
}));

describe('webhook/informational handler', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let responseData: unknown;
  let statusCode: number;

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = 'test-secret-123';
    mockSaveRawWebhook.mockResolvedValue('test-event-id');

    mockReq = {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      query: { secret: 'test-secret-123' },
      body: 'BOS Bullish ES 5m',
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

  it('returns 200 and stores raw body for valid secret with text/plain body', async () => {
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect(responseData).toEqual({ success: true, eventId: 'test-event-id' });
    expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
      source: 'informational',
      rawBody: 'BOS Bullish ES 5m',
      contentType: 'text/plain',
    });
  });

  it('returns 200 and stores raw body for valid secret with JSON body', async () => {
    mockReq.headers = { 'content-type': 'application/json' };
    mockReq.body = { type: 'CHoCH', direction: 'bearish', symbol: 'NQ' };
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect(responseData).toEqual({ success: true, eventId: 'test-event-id' });
    expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
      source: 'informational',
      rawBody: JSON.stringify({ type: 'CHoCH', direction: 'bearish', symbol: 'NQ' }),
      contentType: 'application/json',
    });
  });

  it('returns 200 and stores raw body for valid secret with empty body', async () => {
    mockReq.body = undefined;
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect(responseData).toEqual({ success: true, eventId: 'test-event-id' });
    expect(mockSaveRawWebhook).toHaveBeenCalledWith('informational_events', {
      source: 'informational',
      rawBody: '""',
      contentType: 'text/plain',
    });
  });

  it('response includes eventId', async () => {
    mockSaveRawWebhook.mockResolvedValue('unique-uuid-xyz');
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(200);
    expect((responseData as { eventId: string }).eventId).toBe('unique-uuid-xyz');
  });

  it('returns 500 when storage fails', async () => {
    mockSaveRawWebhook.mockRejectedValue(new Error('DB write failed'));
    await handler(mockReq as VercelRequest, mockRes as VercelResponse);

    expect(statusCode).toBe(500);
    expect(responseData).toEqual({ success: false, error: 'Storage error' });
  });
});
