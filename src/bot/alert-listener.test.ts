import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertListener } from './alert-listener';
import type { AlertRow } from '../types/database';

// Mock channel
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
let capturedCallback: ((payload: { new: AlertRow }) => void) | null = null;
let capturedSubscribeCallback: ((status: string) => void) | null = null;

const mockChannel = {
  on: vi.fn().mockImplementation((_event: string, _filter: unknown, callback: (payload: { new: AlertRow }) => void) => {
    capturedCallback = callback;
    return mockChannel;
  }),
  subscribe: vi.fn().mockImplementation((callback: (status: string) => void) => {
    capturedSubscribeCallback = callback;
    callback('SUBSCRIBED');
    return mockChannel;
  }),
  unsubscribe: mockUnsubscribe,
};

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
} as unknown as Parameters<AlertListener['start']>[0];

function makeAlert(overrides?: Partial<AlertRow>): AlertRow {
  return {
    id: 'alert-1',
    created_at: '2026-02-12T15:00:00Z',
    symbol: 'ES',
    action: 'buy',
    quantity: 1,
    order_type: 'market',
    price: null,
    stop_loss: null,
    take_profit: null,
    comment: null,
    status: 'received',
    error_message: null,
    order_id: null,
    executed_at: null,
    raw_payload: {},
    ...overrides,
  };
}

describe('AlertListener', () => {
  let listener: AlertListener;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
    capturedSubscribeCallback = null;
    listener = new AlertListener();
  });

  describe('subscription setup', () => {
    it('subscribes to alerts table INSERT events', () => {
      listener.start(mockSupabase);

      expect(mockSupabase.channel).toHaveBeenCalledWith('bot-alerts');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        expect.any(Function),
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('emits newAlert for received buy alert', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeAlert({ action: 'buy', status: 'received' }) });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ action: 'buy' }));
    });

    it('ignores non-received alerts', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeAlert({ status: 'processing' }) });

      expect(handler).not.toHaveBeenCalled();
    });

    it('emits for all valid actions', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      for (const action of ['buy', 'sell', 'close', 'close_long', 'close_short'] as const) {
        capturedCallback!({ new: makeAlert({ action }) });
      }

      expect(handler).toHaveBeenCalledTimes(5);
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribes on stop', async () => {
      listener.start(mockSupabase);
      await listener.stop();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('stop is idempotent', async () => {
      await listener.stop(); // No channel yet
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });
  });
});
