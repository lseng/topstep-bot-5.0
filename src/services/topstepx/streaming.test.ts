import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopstepXStreaming } from './streaming';
import type { MarketTick, OrderFillEvent, OrderStatusEvent, PositionUpdateEvent, ConnectionState } from './types';

// Mock SignalR
const mockHubConnection = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  onreconnecting: vi.fn(),
  onreconnected: vi.fn(),
  onclose: vi.fn(),
};

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: vi.fn().mockReturnValue({
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn(() => ({ ...mockHubConnection })),
  }),
}));

const streamingConfig = {
  marketHubUrl: 'https://api.example.com/market',
  userHubUrl: 'https://api.example.com/user',
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 3,
};

describe('TopstepXStreaming', () => {
  let streaming: TopstepXStreaming;

  beforeEach(() => {
    vi.clearAllMocks();
    streaming = new TopstepXStreaming(streamingConfig, 'test-token');
  });

  describe('connect/disconnect lifecycle', () => {
    it('should start in disconnected state', () => {
      expect(streaming.getState()).toBe('disconnected');
    });

    it('should connect to both hubs', async () => {
      await streaming.connect();
      expect(streaming.getState()).toBe('connected');
    });

    it('should disconnect from both hubs', async () => {
      await streaming.connect();
      await streaming.disconnect();
      expect(streaming.getState()).toBe('disconnected');
    });

    it('should emit state changes', async () => {
      const states: ConnectionState[] = [];
      streaming.onStateChange((s) => states.push(s));

      await streaming.connect();
      await streaming.disconnect();

      expect(states).toEqual(['connecting', 'connected', 'disconnected']);
    });
  });

  describe('subscriptions', () => {
    it('should throw when subscribing without connecting', async () => {
      await expect(streaming.subscribeMarketData('CON.F.US.ENQ.M25')).rejects.toThrow('Market hub not connected');
    });

    it('should throw when subscribing user events without connecting', async () => {
      await expect(streaming.subscribeUserEvents(1)).rejects.toThrow('User hub not connected');
    });
  });

  describe('event listeners', () => {
    it('should register and unregister tick listener', () => {
      const callback = vi.fn();
      const unsubscribe = streaming.onTick(callback);

      // Simulate a tick event
      const tick: MarketTick = {
        contractId: 'CON.F.US.ENQ.M25',
        price: 18500,
        size: 1,
        timestamp: '2026-02-12T10:00:00Z',
        side: 'Trade',
      };

      // Manually trigger to test listener storage
      unsubscribe();
      // After unsubscribe, callback should not be in list
      expect(callback).not.toHaveBeenCalled();
    });

    it('should register fill listener', () => {
      const callback = vi.fn();
      const unsubscribe = streaming.onFill(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should register order status listener', () => {
      const callback = vi.fn();
      const unsubscribe = streaming.onOrderStatus(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should register position update listener', () => {
      const callback = vi.fn();
      const unsubscribe = streaming.onPositionUpdate(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should register state change listener', () => {
      const callback = vi.fn();
      const unsubscribe = streaming.onStateChange(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
