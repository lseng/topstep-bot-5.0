import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertListener } from './alert-listener';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

function createMockSupabase(): {
  supabase: SupabaseClient;
  triggerInsert: (data: Record<string, unknown>) => void;
} {
  let insertHandler: ((payload: { new: Record<string, unknown> }) => void) | null = null;

  const mockChannel: Partial<RealtimeChannel> = {
    on: vi.fn().mockImplementation((_event: string, _filter: unknown, handler: (payload: { new: Record<string, unknown> }) => void) => {
      insertHandler = handler;
      return mockChannel;
    }),
    subscribe: vi.fn().mockReturnThis(),
  };

  const supabase = {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  } as unknown as SupabaseClient;

  return {
    supabase,
    triggerInsert: (data: Record<string, unknown>) => {
      if (insertHandler) {
        insertHandler({ new: data });
      }
    },
  };
}

describe('AlertListener', () => {
  let supabase: SupabaseClient;
  let triggerInsert: (data: Record<string, unknown>) => void;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mock = createMockSupabase();
    supabase = mock.supabase;
    triggerInsert = mock.triggerInsert;
    callback = vi.fn();
  });

  it('should subscribe to alerts channel on start', () => {
    const listener = new AlertListener(supabase, callback);
    listener.start();

    expect(supabase.channel).toHaveBeenCalledWith('alerts-realtime');
  });

  it('should call callback when new alert is inserted', () => {
    const listener = new AlertListener(supabase, callback);
    listener.start();

    const alertData = { id: 'test-id', symbol: 'NQ', action: 'buy', status: 'received' };
    triggerInsert(alertData);

    expect(callback).toHaveBeenCalledWith(alertData);
  });

  it('should not start multiple channels', () => {
    const listener = new AlertListener(supabase, callback);
    listener.start();
    listener.start();

    expect(supabase.channel).toHaveBeenCalledTimes(1);
  });

  it('should remove channel on stop', async () => {
    const listener = new AlertListener(supabase, callback);
    listener.start();
    await listener.stop();

    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it('should handle stop when not started', async () => {
    const listener = new AlertListener(supabase, callback);
    await listener.stop(); // Should not throw
  });
});
