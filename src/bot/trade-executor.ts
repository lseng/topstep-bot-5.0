// Trade Executor — Wraps TopstepX client for order management

import type { TopstepXClient } from '../services/topstepx/client';
import type { OrderResponse } from '../services/topstepx/types';
import type { ManagedPosition } from './types';

export class TradeExecutor {
  private client: TopstepXClient;
  private dryRun: boolean;

  constructor(client: TopstepXClient, dryRun = false) {
    this.client = client;
    this.dryRun = dryRun;
  }

  /** Place a limit order for position entry */
  async placeLimitOrder(position: ManagedPosition): Promise<OrderResponse> {
    if (this.dryRun) {
      return { success: true, orderId: -1, errorMessage: null };
    }

    return this.client.placeOrder({
      accountId: position.accountId,
      contractId: position.contractId,
      type: 'Limit',
      side: position.side === 'long' ? 'Buy' : 'Sell',
      size: position.quantity,
      limitPrice: position.targetEntryPrice,
    });
  }

  /** Cancel a pending order */
  async cancelOrder(orderId: number, accountId: number): Promise<OrderResponse> {
    if (this.dryRun) {
      return { success: true, orderId, errorMessage: null };
    }

    return this.client.cancelOrder({ orderId, accountId });
  }

  /** Close a position with a market order */
  async closePosition(position: ManagedPosition): Promise<OrderResponse> {
    if (this.dryRun) {
      return { success: true, orderId: -1, errorMessage: null };
    }

    return this.client.placeOrder({
      accountId: position.accountId,
      contractId: position.contractId,
      type: 'Market',
      side: position.side === 'long' ? 'Sell' : 'Buy', // Opposite side to close
      size: position.quantity,
    });
  }
}
