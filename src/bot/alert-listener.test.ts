import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertListener } from './alert-listener';
import type { SfxAlgoAlertRow } from '../types/database';
import type { SfxEnrichedAlert } from './alert-listener';

// Mock channel
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
let capturedCallback: ((payload: { new: SfxAlgoAlertRow }) => void) | null = null;

const mockChannel = {
  on: vi.fn().mockImplementation((_event: string, _filter: unknown, callback: (payload: { new: SfxAlgoAlertRow }) => void) => {
    capturedCallback = callback;
    return mockChannel;
  }),
  subscribe: vi.fn().mockImplementation((callback: (status: string) => void) => {
    callback('SUBSCRIBED');
    return mockChannel;
  }),
  unsubscribe: mockUnsubscribe,
};

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
} as unknown as Parameters<AlertListener['start']>[0];

function makeSfxAlert(overrides?: Partial<SfxAlgoAlertRow>): SfxAlgoAlertRow {
  return {
    id: 'sfx-1',
    created_at: '2026-02-16T15:00:00Z',
    source: 'sfx-algo',
    raw_body: '{}',
    content_type: 'application/json',
    ticker: 'ES1!',
    symbol: 'ES',
    alert_type: 'buy',
    signal_direction: 'bull',
    price: 6877.75,
    current_rating: 2,
    tp1: 6878,
    tp2: 6882.5,
    tp3: 6887,
    stop_loss: 6859,
    entry_price: null,
    unix_time: 1771230000000,
    ...overrides,
  };
}

describe('AlertListener', () => {
  let listener: AlertListener;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
    listener = new AlertListener();
  });

  describe('subscription setup', () => {
    it('subscribes to sfx_algo_alerts table INSERT events', () => {
      listener.start(mockSupabase);

      expect(mockSupabase.channel).toHaveBeenCalledWith('bot-sfx-alerts');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sfx_algo_alerts' },
        expect.any(Function),
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('emits newAlert for buy entry alert', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert({ alert_type: 'buy' }) });

      expect(handler).toHaveBeenCalledTimes(1);
      const enriched = handler.mock.calls[0][0] as SfxEnrichedAlert;
      expect(enriched.alert.action).toBe('buy');
      expect(enriched.alert.symbol).toBe('ES');
    });

    it('emits newAlert for sell entry alert', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert({ alert_type: 'sell', signal_direction: 'bear' }) });

      expect(handler).toHaveBeenCalledTimes(1);
      const enriched = handler.mock.calls[0][0] as SfxEnrichedAlert;
      expect(enriched.alert.action).toBe('sell');
    });

    it('skips TP1/TP2/TP3/sl exit alerts', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      for (const alertType of ['TP1', 'TP2', 'TP3', 'sl']) {
        capturedCallback!({ new: makeSfxAlert({ alert_type: alertType }) });
      }

      expect(handler).not.toHaveBeenCalled();
    });

    it('skips alerts without a symbol', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert({ symbol: null }) });

      expect(handler).not.toHaveBeenCalled();
    });

    it('includes SFX TP levels and stop loss when present', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert({ tp1: 100, tp2: 110, tp3: 120, stop_loss: 90 }) });

      const enriched = handler.mock.calls[0][0] as SfxEnrichedAlert;
      expect(enriched.sfxTpLevels).toEqual({ tp1: 100, tp2: 110, tp3: 120, stopLoss: 90 });
    });

    it('sfxTpLevels is undefined when TPs are missing', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert({ tp1: null, tp2: null, tp3: null }) });

      const enriched = handler.mock.calls[0][0] as SfxEnrichedAlert;
      expect(enriched.sfxTpLevels).toBeUndefined();
    });

    it('transforms SFX alert into AlertRow shape', () => {
      const handler = vi.fn();
      listener.on('newAlert', handler);
      listener.start(mockSupabase);

      capturedCallback!({ new: makeSfxAlert() });

      const enriched = handler.mock.calls[0][0] as SfxEnrichedAlert;
      const alert = enriched.alert;
      expect(alert.id).toBe('sfx-1');
      expect(alert.symbol).toBe('ES');
      expect(alert.action).toBe('buy');
      expect(alert.status).toBe('received');
      expect(alert.strategy).toBe('sfx-algo');
      expect(alert.price).toBe(6877.75);
      expect(alert.raw_payload).toEqual(expect.objectContaining({
        source: 'sfx-algo',
        ticker: 'ES1!',
        signal_direction: 'bull',
      }));
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
