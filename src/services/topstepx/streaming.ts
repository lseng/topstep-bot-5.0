// TopstepX SignalR Streaming Client — Market Hub + User Hub

import * as signalR from '@microsoft/signalr';
import type {
  StreamingConfig,
  ConnectionState,
  MarketTick,
  OrderFillEvent,
  OrderStatusEvent,
  PositionUpdateEvent,
} from './types';

type EventCallback<T> = (data: T) => void;

export class TopstepXStreaming {
  private marketHub: signalR.HubConnection | null = null;
  private userHub: signalR.HubConnection | null = null;
  private config: StreamingConfig;
  private token: string;
  private state: ConnectionState = 'disconnected';

  // Event listeners
  private tickListeners: EventCallback<MarketTick>[] = [];
  private fillListeners: EventCallback<OrderFillEvent>[] = [];
  private orderStatusListeners: EventCallback<OrderStatusEvent>[] = [];
  private positionUpdateListeners: EventCallback<PositionUpdateEvent>[] = [];
  private stateChangeListeners: EventCallback<ConnectionState>[] = [];

  constructor(config: StreamingConfig, token: string) {
    this.config = config;
    this.token = token;
  }

  /** Connect to both Market Hub and User Hub */
  async connect(): Promise<void> {
    this.setState('connecting');

    const reconnectDelay = this.config.reconnectDelayMs ?? 5000;
    const maxAttempts = this.config.maxReconnectAttempts ?? 10;

    const retryPolicy: signalR.IRetryPolicy = {
      nextRetryDelayInMilliseconds: (context) => {
        if (context.previousRetryCount >= maxAttempts) return null;
        return reconnectDelay;
      },
    };

    this.marketHub = new signalR.HubConnectionBuilder()
      .withUrl(this.config.marketHubUrl, {
        accessTokenFactory: () => this.token,
      })
      .withAutomaticReconnect(retryPolicy)
      .build();

    this.userHub = new signalR.HubConnectionBuilder()
      .withUrl(this.config.userHubUrl, {
        accessTokenFactory: () => this.token,
      })
      .withAutomaticReconnect(retryPolicy)
      .build();

    this.setupMarketHubHandlers();
    this.setupUserHubHandlers();
    this.setupReconnectionHandlers();

    await Promise.all([
      this.marketHub.start(),
      this.userHub.start(),
    ]);

    this.setState('connected');
  }

  /** Disconnect from both hubs */
  async disconnect(): Promise<void> {
    const stops: Promise<void>[] = [];
    if (this.marketHub) stops.push(this.marketHub.stop());
    if (this.userHub) stops.push(this.userHub.stop());
    await Promise.all(stops);
    this.marketHub = null;
    this.userHub = null;
    this.setState('disconnected');
  }

  /** Subscribe to market data for a contract */
  async subscribeMarketData(contractId: string): Promise<void> {
    if (!this.marketHub) throw new Error('Market hub not connected');
    await this.marketHub.invoke('SubscribeMarketData', contractId);
  }

  /** Unsubscribe from market data for a contract */
  async unsubscribeMarketData(contractId: string): Promise<void> {
    if (!this.marketHub) throw new Error('Market hub not connected');
    await this.marketHub.invoke('UnsubscribeMarketData', contractId);
  }

  /** Subscribe to user events for an account */
  async subscribeUserEvents(accountId: number): Promise<void> {
    if (!this.userHub) throw new Error('User hub not connected');
    await this.userHub.invoke('SubscribeUserEvents', accountId);
  }

  // --- Event registration ---

  onTick(callback: EventCallback<MarketTick>): () => void {
    this.tickListeners.push(callback);
    return () => {
      this.tickListeners = this.tickListeners.filter((cb) => cb !== callback);
    };
  }

  onFill(callback: EventCallback<OrderFillEvent>): () => void {
    this.fillListeners.push(callback);
    return () => {
      this.fillListeners = this.fillListeners.filter((cb) => cb !== callback);
    };
  }

  onOrderStatus(callback: EventCallback<OrderStatusEvent>): () => void {
    this.orderStatusListeners.push(callback);
    return () => {
      this.orderStatusListeners = this.orderStatusListeners.filter((cb) => cb !== callback);
    };
  }

  onPositionUpdate(callback: EventCallback<PositionUpdateEvent>): () => void {
    this.positionUpdateListeners.push(callback);
    return () => {
      this.positionUpdateListeners = this.positionUpdateListeners.filter((cb) => cb !== callback);
    };
  }

  onStateChange(callback: EventCallback<ConnectionState>): () => void {
    this.stateChangeListeners.push(callback);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((cb) => cb !== callback);
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  // --- Private ---

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateChangeListeners.forEach((cb) => cb(state));
  }

  private setupMarketHubHandlers(): void {
    if (!this.marketHub) return;
    this.marketHub.on('MarketData', (data: MarketTick) => {
      this.tickListeners.forEach((cb) => cb(data));
    });
  }

  private setupUserHubHandlers(): void {
    if (!this.userHub) return;
    this.userHub.on('OrderFill', (data: OrderFillEvent) => {
      this.fillListeners.forEach((cb) => cb(data));
    });
    this.userHub.on('OrderStatus', (data: OrderStatusEvent) => {
      this.orderStatusListeners.forEach((cb) => cb(data));
    });
    this.userHub.on('PositionUpdate', (data: PositionUpdateEvent) => {
      this.positionUpdateListeners.forEach((cb) => cb(data));
    });
  }

  private setupReconnectionHandlers(): void {
    const handleReconnecting = (): void => this.setState('reconnecting');
    const handleReconnected = (): void => this.setState('connected');
    const handleClose = (): void => this.setState('disconnected');

    if (this.marketHub) {
      this.marketHub.onreconnecting(handleReconnecting);
      this.marketHub.onreconnected(handleReconnected);
      this.marketHub.onclose(handleClose);
    }
    if (this.userHub) {
      this.userHub.onreconnecting(handleReconnecting);
      this.userHub.onreconnected(handleReconnected);
      this.userHub.onclose(handleClose);
    }
  }
}
