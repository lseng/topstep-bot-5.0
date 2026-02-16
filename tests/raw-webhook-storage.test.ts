import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { saveRawWebhook } from '../src/services/raw-webhook-storage';

describe('saveRawWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts into sfx_algo_alerts with correct fields and returns UUID', async () => {
    const eventId = 'test-uuid-001';
    mockSingle.mockResolvedValue({ data: { id: eventId }, error: null });

    const result = await saveRawWebhook('sfx_algo_alerts', {
      source: 'sfx-algo',
      rawBody: 'S2 BUY signal ES',
      contentType: 'text/plain',
    });

    expect(result).toBe(eventId);
    expect(mockFrom).toHaveBeenCalledWith('sfx_algo_alerts');
    expect(mockInsert).toHaveBeenCalledWith({
      source: 'sfx-algo',
      raw_body: 'S2 BUY signal ES',
      content_type: 'text/plain',
    });
  });

  it('handles null content_type', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'test-uuid-003' }, error: null });

    const result = await saveRawWebhook('sfx_algo_alerts', {
      source: 'sfx-algo',
      rawBody: 'some data',
      contentType: null,
    });

    expect(result).toBe('test-uuid-003');
    expect(mockInsert).toHaveBeenCalledWith({
      source: 'sfx-algo',
      raw_body: 'some data',
      content_type: null,
    });
  });

  it('throws on database error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB connection failed' } });

    await expect(
      saveRawWebhook('sfx_algo_alerts', {
        source: 'sfx-algo',
        rawBody: 'test',
        contentType: null,
      }),
    ).rejects.toThrow('Failed to save raw webhook: DB connection failed');
  });
});
