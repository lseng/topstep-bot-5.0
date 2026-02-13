// TopstepX SignalR Hub Connections
// Real-time order updates (User Hub) and market data (Market Hub)

import * as signalR from '@microsoft/signalr';
import { logger } from '../../lib/logger';
import type {
  GatewayOrderEvent,
  GatewayPositionEvent,
  GatewayAccountEvent,
  GatewayTradeEvent,
  GatewayQuoteEvent,
  GatewayMarketTradeEvent,
  GatewayDepthEvent,
} from './types';

// ─── Reconnect policy ────────────────────────────────────────────────────────

const RECONNECT_INTERVALS = [0, 2000, 5000, 10000, 30000];

class FixedRetryPolicy implements signalR.IRetryPolicy {
  nextRetryDelayInMilliseconds(retryContext: signalR.RetryContext): number | null {
    if (retryContext.previousRetryCount >= RECONNECT_INTERVALS.length) {
      return RECONNECT_INTERVALS[RECONNECT_INTERVALS.length - 1];
    }
    return RECONNECT_INTERVALS[retryContext.previousRetryCount];
  }
}

// ─── User Hub (Order / Position / Account updates) ───────────────────────────

export type OrderUpdateHandler = (event: GatewayOrderEvent) => void;
export type PositionUpdateHandler = (event: GatewayPositionEvent) => void;
export type AccountUpdateHandler = (event: GatewayAccountEvent) => void;
export type TradeUpdateHandler = (event: GatewayTradeEvent) => void;

export class UserHubConnection {
  private connection: signalR.HubConnection | null = null;
  private _isConnected = false;

  onOrderUpdate: OrderUpdateHandler | null = null;
  onPositionUpdate: PositionUpdateHandler | null = null;
  onAccountUpdate: AccountUpdateHandler | null = null;
  onTradeUpdate: TradeUpdateHandler | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(accessToken: string): Promise<void> {
    const hubUrl = process.env.TOPSTEPX_USER_HUB_URL?.trim();
    if (!hubUrl) throw new Error('Missing TOPSTEPX_USER_HUB_URL environment variable');

    const url = `${hubUrl}?access_token=${accessToken}`;
    logger.info('Connecting to User Hub');

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(url, { skipNegotiation: true, transport: signalR.HttpTransportType.WebSockets })
      .withAutomaticReconnect(new FixedRetryPolicy())
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connection.onclose((error) => {
      this._isConnected = false;
      logger.warn('User Hub disconnected', { error: error?.message });
    });

    this.connection.onreconnecting((error) => {
      this._isConnected = false;
      logger.warn('User Hub reconnecting', { error: error?.message });
    });

    this.connection.onreconnected(() => {
      this._isConnected = true;
      logger.info('User Hub reconnected');
    });

    // Register event handlers
    this.connection.on('GatewayUserOrder', (data: GatewayOrderEvent) => {
      logger.debug('GatewayUserOrder event', { orderId: data.orderId, status: data.status });
      this.onOrderUpdate?.(data);
    });

    this.connection.on('GatewayUserPosition', (data: GatewayPositionEvent) => {
      logger.debug('GatewayUserPosition event', {
        contractId: data.contractId,
        size: data.size,
      });
      this.onPositionUpdate?.(data);
    });

    this.connection.on('GatewayUserAccount', (data: GatewayAccountEvent) => {
      logger.debug('GatewayUserAccount event', { accountId: data.id });
      this.onAccountUpdate?.(data);
    });

    this.connection.on('GatewayUserTrade', (data: GatewayTradeEvent) => {
      logger.debug('GatewayUserTrade event', { orderId: data.orderId, status: data.status });
      this.onTradeUpdate?.(data);
    });

    await this.connection.start();
    this._isConnected = true;
    logger.info('Connected to User Hub');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this._isConnected = false;
      logger.info('Disconnected from User Hub');
    }
  }
}

// ─── Market Hub (Quotes / Trades / Depth) ────────────────────────────────────

export type QuoteHandler = (event: GatewayQuoteEvent) => void;
export type MarketTradeHandler = (event: GatewayMarketTradeEvent) => void;
export type DepthHandler = (event: GatewayDepthEvent) => void;

export class MarketHubConnection {
  private connection: signalR.HubConnection | null = null;
  private _isConnected = false;
  private subscribedContracts = new Set<string>();

  onQuote: QuoteHandler | null = null;
  onTrade: MarketTradeHandler | null = null;
  onDepth: DepthHandler | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(accessToken: string): Promise<void> {
    const hubUrl = process.env.TOPSTEPX_MARKET_HUB_URL?.trim();
    if (!hubUrl) throw new Error('Missing TOPSTEPX_MARKET_HUB_URL environment variable');

    const url = `${hubUrl}?access_token=${accessToken}`;
    logger.info('Connecting to Market Hub');

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(url, { skipNegotiation: true, transport: signalR.HttpTransportType.WebSockets })
      .withAutomaticReconnect(new FixedRetryPolicy())
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connection.onclose((error) => {
      this._isConnected = false;
      logger.warn('Market Hub disconnected', { error: error?.message });
    });

    this.connection.onreconnecting((error) => {
      this._isConnected = false;
      logger.warn('Market Hub reconnecting', { error: error?.message });
    });

    this.connection.onreconnected(() => {
      this._isConnected = true;
      logger.info('Market Hub reconnected');
      // Re-subscribe to all contracts
      const resubscribe = async (): Promise<void> => {
        for (const contractId of this.subscribedContracts) {
          await this.subscribe(contractId);
        }
      };
      resubscribe().catch((err) => {
        logger.error('Failed to re-subscribe after reconnect', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    });

    // Register event handlers
    this.connection.on('GatewayQuote', (data: GatewayQuoteEvent) => {
      this.onQuote?.(data);
    });

    this.connection.on('GatewayTrade', (data: GatewayMarketTradeEvent) => {
      this.onTrade?.(data);
    });

    this.connection.on('GatewayDepth', (data: GatewayDepthEvent) => {
      this.onDepth?.(data);
    });

    await this.connection.start();
    this._isConnected = true;
    logger.info('Connected to Market Hub');
  }

  async subscribe(contractId: string): Promise<void> {
    if (!this.connection || !this._isConnected) {
      throw new Error('Not connected to Market Hub');
    }

    logger.info('Subscribing to market data', { contractId });
    await this.connection.send('SubscribeContractQuotes', contractId);
    await this.connection.send('SubscribeContractTrades', contractId);
    this.subscribedContracts.add(contractId);
  }

  async unsubscribe(contractId: string): Promise<void> {
    if (!this.connection || !this._isConnected) return;

    logger.info('Unsubscribing from market data', { contractId });
    await this.connection.send('UnsubscribeContractQuotes', contractId);
    await this.connection.send('UnsubscribeContractTrades', contractId);
    this.subscribedContracts.delete(contractId);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.subscribedContracts.clear();
      await this.connection.stop();
      this._isConnected = false;
      logger.info('Disconnected from Market Hub');
    }
  }
}
