// E2E test suite for bot runner dry-run mode
// Verifies the bot processes alerts without placing real orders

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPlaceOrder = vi.fn();
const mockCancelOrder = vi.fn();

vi.mock('../../src/services/topstepx/client', () => ({
  TopstepXClient: vi.fn().mockImplementation(() => ({
    placeOrder: mockPlaceOrder,
    cancelOrder: mockCancelOrder,
    authenticate: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { TradeExecutor } from '../../src/bot/trade-executor';
import type { ManagedPosition } from '../../src/bot/types';

function makeMockPosition(overrides: Partial<ManagedPosition> = {}): ManagedPosition {
  return {
    id: 'pos-1',
    alertId: 'alert-1',
    symbol: 'ES',
    side: 'long',
    state: 'pending_entry',
    quantity: 1,
    contractId: 'ESH6',
    accountId: 12345,
    entryOrderId: null,
    targetEntryPrice: 5100.0,
    entryPrice: null,
    tp1Price: 5110.0,
    tp2Price: 5120.0,
    tp3Price: 5130.0,
    initialSl: 5090.0,
    currentSl: 5090.0,
    lastPrice: null,
    unrealizedPnl: 0,
    vpvrData: { poc: 5100, vah: 5110, val: 5090, rangeHigh: 5130, rangeLow: 5070, profileBins: [], totalVolume: 10000 },
    confirmationScore: null,
    llmReasoning: null,
    llmConfidence: null,
    createdAt: new Date(),
    exitPrice: null,
    exitReason: null,
    closedAt: null,
    dirty: false,
    ...overrides,
  } as ManagedPosition;
}

describe('Bot Dry-Run E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TradeExecutor does not place real orders in dry-run mode', async () => {
    const executor = new TradeExecutor(
      { placeOrder: mockPlaceOrder, cancelOrder: mockCancelOrder } as never,
      true, // dryRun
    );

    const result = await executor.placeLimitOrder(makeMockPosition());

    expect(result).toEqual({ success: true, orderId: -1, errorMessage: null });
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it('TradeExecutor does not cancel real orders in dry-run mode', async () => {
    const executor = new TradeExecutor(
      { placeOrder: mockPlaceOrder, cancelOrder: mockCancelOrder } as never,
      true,
    );

    const result = await executor.cancelOrder(99999, 12345);

    expect(result).toEqual({ success: true, orderId: 99999, errorMessage: null });
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it('TradeExecutor does not close real positions in dry-run mode', async () => {
    const executor = new TradeExecutor(
      { placeOrder: mockPlaceOrder, cancelOrder: mockCancelOrder } as never,
      true,
    );

    const result = await executor.closePosition(makeMockPosition());

    expect(result).toEqual({ success: true, orderId: -1, errorMessage: null });
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it('TradeExecutor places real orders when NOT in dry-run mode', async () => {
    mockPlaceOrder.mockResolvedValue({ success: true, orderId: 123, errorMessage: null });

    const executor = new TradeExecutor(
      { placeOrder: mockPlaceOrder, cancelOrder: mockCancelOrder } as never,
      false,
    );

    const result = await executor.placeLimitOrder(makeMockPosition());

    expect(result).toEqual({ success: true, orderId: 123, errorMessage: null });
    expect(mockPlaceOrder).toHaveBeenCalledOnce();
  });
});
