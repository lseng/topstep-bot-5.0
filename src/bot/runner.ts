// Bot runner — main orchestrator wiring SignalR hubs, alert listener, position manager, executor, writer

import { logger } from '../lib/logger';
import { getSupabase } from '../lib/supabase';
import { authenticate, getToken, getCurrentContractId, getPositions } from '../services/topstepx/client';
import { UserHubConnection, MarketHubConnection } from '../services/topstepx/streaming';
import { calculateVpvr } from '../services/vpvr/calculator';
import { fetchBars } from '../services/confirmation/engine';
import { OrderStatusNum, CONTRACT_SPECS } from '../services/topstepx/types';
import type { GatewayOrderEvent, GatewayQuoteEvent, GatewayPositionEvent } from '../services/topstepx/types';
import type { AlertRow } from '../types/database';
import type { BotConfig, ManagedPosition, PositionState, PositionSide, TradeResult } from './types';
import { PositionManager } from './position-manager';
import { TradeExecutor } from './trade-executor';
import { SupabaseWriteQueue } from './supabase-writer';
import { AlertListener } from './alert-listener';
import { analyzeTrade } from './llm-analyzer';

/**
 * BotRunner — main orchestrator for the autonomous trading pipeline.
 *
 * Lifecycle:
 *   start() → authenticate → connect hubs → subscribe alerts → run
 *   stop()  → flush writes → disconnect hubs → unsubscribe alerts
 */
export class BotRunner {
  private config: BotConfig;
  private userHub: UserHubConnection;
  private marketHub: MarketHubConnection;
  private alertListener: AlertListener;
  private positionManager: PositionManager;
  private executor: TradeExecutor;
  private writeQueue: SupabaseWriteQueue;
  private running = false;

  /** Reverse lookup: contractId → symbol for quote routing */
  private contractToSymbol: Map<string, string>;

  /** Track pending retry order IDs: symbol → { steppedOrderId, fallbackOrderId } */
  private retryOrders = new Map<string, { steppedOrderId: number; fallbackOrderId: number }>();

  /** Position reconciliation timer */
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: BotConfig) {
    this.config = config;
    this.userHub = new UserHubConnection();
    this.marketHub = new MarketHubConnection();
    this.alertListener = new AlertListener();
    this.positionManager = new PositionManager({
      accountId: config.accountId,
      contractIds: config.contractIds,
      symbols: config.symbols,
      quantity: config.quantity,
      maxContracts: config.maxContracts,
      maxRetries: config.maxRetries,
      slBufferTicks: config.slBufferTicks,
    });
    this.executor = new TradeExecutor(config.dryRun);
    this.writeQueue = new SupabaseWriteQueue(config.writeIntervalMs);

    // Build reverse lookup for quote routing
    this.contractToSymbol = new Map<string, string>();
    for (const [symbol, contractId] of config.contractIds.entries()) {
      this.contractToSymbol.set(contractId, symbol);
    }

    this.wireEvents();
  }

  /** Start the bot */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    logger.info('Bot starting', {
      symbols: this.config.symbols,
      accountId: this.config.accountId,
      dryRun: this.config.dryRun,
    });

    // Authenticate with TopstepX
    const ok = await authenticate();
    if (!ok) throw new Error('Failed to authenticate with TopstepX');

    const token = await getToken();

    // Connect SignalR hubs
    await this.userHub.connect(token);
    await this.marketHub.connect(token);

    // Subscribe to all symbol contracts
    for (const [symbol, contractId] of this.config.contractIds.entries()) {
      await this.marketHub.subscribe(contractId);
      logger.info('Subscribed to contract', { symbol, contractId });
    }

    // Start alert listener
    const supabase = getSupabase();
    this.alertListener.start(supabase);

    // Start write queue
    this.writeQueue.start();

    // Start position reconciliation polling
    if (this.config.syncIntervalMs > 0) {
      this.syncInterval = setInterval(() => {
        this.reconcilePositions().catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Position reconciliation failed', { error: msg });
        });
      }, this.config.syncIntervalMs);
      logger.info('Position sync enabled', { intervalMs: this.config.syncIntervalMs });
    }

    logger.info('Bot running', {
      symbols: this.config.symbols,
      contracts: Array.from(this.config.contractIds.values()),
    });
  }

  /** Stop the bot gracefully */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    logger.info('Bot stopping...');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    await this.alertListener.stop();
    this.writeQueue.stop();
    await this.writeQueue.flush();
    await this.marketHub.disconnect();
    await this.userHub.disconnect();

    logger.info('Bot stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  get positions(): PositionManager {
    return this.positionManager;
  }

  getStatus(): {
    running: boolean;
    userHubConnected: boolean;
    marketHubConnected: boolean;
    activePositions: number;
    pendingWrites: number;
    symbols: string[];
    contractIds: string[];
  } {
    return {
      running: this.running,
      userHubConnected: this.userHub.isConnected,
      marketHubConnected: this.marketHub.isConnected,
      activePositions: this.positionManager.getActivePositions().length,
      pendingWrites: this.writeQueue.pendingCount,
      symbols: this.config.symbols,
      contractIds: Array.from(this.config.contractIds.values()),
    };
  }

  // ─── Event Wiring ──────────────────────────────────────────────────────────

  private wireEvents(): void {
    // Alert listener → Position manager (dynamic symbol handling)
    this.alertListener.on('newAlert', (alert: AlertRow) => {
      // If symbols list is non-empty, filter to only those symbols
      if (this.config.symbols.length > 0 && !this.config.symbols.includes(alert.symbol)) return;

      // Dynamic symbol resolution: if symbol not yet in contractIds, try to resolve it
      if (!this.config.contractIds.has(alert.symbol)) {
        if (!CONTRACT_SPECS[alert.symbol.toUpperCase()]) {
          logger.warn('Unknown symbol, skipping alert', { symbol: alert.symbol, alertId: alert.id });
          return;
        }

        // Resolve contract ID dynamically
        try {
          const contractId = getCurrentContractId(alert.symbol);
          this.config.contractIds.set(alert.symbol, contractId);
          this.contractToSymbol.set(contractId, alert.symbol);
          // Subscribe to market data for the new symbol
          this.marketHub.subscribe(contractId).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to subscribe to dynamic symbol', { symbol: alert.symbol, error: msg });
          });
          logger.info('Dynamically resolved symbol', { symbol: alert.symbol, contractId });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to resolve contract ID for symbol', { symbol: alert.symbol, error: msg });
          return;
        }
      }

      this.handleNewAlert(alert).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error('Failed to handle alert', { alertId: alert.id, error: msg });
      });
    });

    // User Hub → Position manager (order fills)
    this.userHub.onOrderUpdate = (event: GatewayOrderEvent): void => {
      if (event.status === (OrderStatusNum.FILLED as number) && event.fillPrice != null) {
        // Check if this is a retry fill — cancel the other order
        this.handleRetryFill(event.orderId);
        this.positionManager.onOrderFill(event.orderId, event.fillPrice);
      }
    };

    // User Hub → Position manager (position updates — detects exchange-side closes like EOD)
    this.userHub.onPositionUpdate = (event: GatewayPositionEvent): void => {
      const symbol = this.contractToSymbol.get(event.contractId);
      if (!symbol) return;

      // If exchange reports size=0 but bot thinks position is active, close it
      if (event.size === 0) {
        const pos = this.positionManager.positions.get(symbol);
        if (pos && pos.state !== 'closed' && pos.state !== 'cancelled') {
          const exitPrice = event.averagePrice || pos.lastPrice || 0;
          logger.info('Exchange position closed (detected via UserHub)', {
            symbol,
            contractId: event.contractId,
            exitPrice,
          });
          this.positionManager.onClose(symbol, exitPrice, 'eod_liquidation');
        }
      }
    };

    // Market Hub → Position manager (price ticks)
    this.marketHub.onQuote = (event: GatewayQuoteEvent): void => {
      const symbol = this.contractToSymbol.get(event.contractId);
      if (symbol) {
        this.positionManager.onTick(symbol, event.last, new Date(event.timestamp));
      }
    };

    // Position manager → Trade executor (place orders)
    this.positionManager.on(
      'placeOrder',
      (params: { symbol: string; side: PositionSide; price: number; quantity: number; positionId: string }) => {
        this.executor
          .placeLimitEntry(params.symbol, params.side, params.price, params.quantity, this.config.accountId)
          .then((response) => {
            if (response.success && response.orderId > 0) {
              const pos = this.positionManager.positions.get(params.symbol);
              if (pos) {
                pos.entryOrderId = response.orderId;
                pos.dirty = true;
              }
            } else if (!response.success) {
              // Order rejected by exchange — cancel the position
              logger.warn('Order rejected by exchange', {
                symbol: params.symbol,
                positionId: params.positionId,
                errorCode: response.errorCode,
                errorMessage: response.errorMessage,
              });
              const pos = this.positionManager.positions.get(params.symbol);
              if (pos && pos.state !== 'closed' && pos.state !== 'cancelled') {
                const oldState = pos.state;
                pos.state = 'cancelled';
                pos.exitReason = `order_rejected: ${response.errorMessage ?? 'unknown'}`;
                pos.closedAt = new Date();
                pos.updatedAt = new Date();
                pos.dirty = true;
                this.positionManager.emit('stateChange', {
                  positionId: pos.id,
                  oldState,
                  newState: 'cancelled' as PositionState,
                  position: pos,
                });
              }
            }
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to place order', { error: msg });
          });
      },
    );

    // Position manager → Log capacity exceeded events
    this.positionManager.on(
      'capacityExceeded',
      (params: { symbol: string; currentMicroEquivalent: number; maxMicroEquivalent: number; requiredMicroEquivalent: number }) => {
        logger.warn('Capacity exceeded, skipping alert', {
          symbol: params.symbol,
          currentMicroEquivalent: params.currentMicroEquivalent,
          maxMicroEquivalent: params.maxMicroEquivalent,
          requiredMicroEquivalent: params.requiredMicroEquivalent,
        });
      },
    );

    // Position manager → Trade executor (cancel orders)
    this.positionManager.on(
      'cancelOrder',
      (params: { orderId: number; positionId: string }) => {
        this.executor
          .cancelEntry(params.orderId, this.config.accountId)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to cancel order', { error: msg });
          });
      },
    );

    // Position manager → Trade executor (close positions)
    this.positionManager.on(
      'closePosition',
      (params: { symbol: string; side: PositionSide; quantity: number; positionId: string; reason: string }) => {
        this.executor
          .marketClose(params.symbol, params.side, params.quantity, this.config.accountId)
          .then(() => {
            const pos = this.positionManager.positions.get(params.symbol);
            const exitPrice = pos?.lastPrice ?? pos?.currentSl ?? 0;
            this.positionManager.onClose(params.symbol, exitPrice, params.reason);
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to close position', { error: msg });
          });
      },
    );

    // Position manager → Retry entry (place dual limit orders)
    this.positionManager.on(
      'retryEntry',
      (params: {
        symbol: string;
        side: PositionSide;
        steppedPrice: number;
        fallbackPrice: number;
        quantity: number;
        positionId: string;
        retryCount: number;
        maxRetries: number;
      }) => {
        this.handleRetryEntry(params).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to handle retry entry', { error: msg });
        });
      },
    );

    // Position manager → Supabase write queue (state changes)
    this.positionManager.on(
      'stateChange',
      (params: { positionId: string; oldState: PositionState; newState: PositionState; position: ManagedPosition }) => {
        this.writeQueue.markDirty(params.position);

        if (params.newState === 'pending_entry' && params.oldState === 'pending_entry') {
          this.writeQueue.createPosition(params.position).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to create position in DB', { error: msg });
          });
        }
      },
    );

    // Position manager → Supabase write queue (trade logs)
    this.positionManager.on('positionClosed', (trade: TradeResult) => {
      this.writeQueue.writeTradeLog(trade).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error('Failed to write trade log', { error: msg });
      });
    });
  }

  /**
   * Handle retry entry — place two limit orders (stepped + fallback).
   * Whichever fills first, the runner cancels the other.
   */
  private async handleRetryEntry(params: {
    symbol: string;
    side: PositionSide;
    steppedPrice: number;
    fallbackPrice: number;
    quantity: number;
    positionId: string;
    retryCount: number;
  }): Promise<void> {
    logger.info('Placing retry entry orders', {
      symbol: params.symbol,
      side: params.side,
      steppedPrice: params.steppedPrice,
      fallbackPrice: params.fallbackPrice,
      retryCount: params.retryCount,
    });

    if (this.config.dryRun) {
      logger.info('[DRY-RUN] Would place stepped limit at', {
        price: params.steppedPrice,
        symbol: params.symbol,
      });
      logger.info('[DRY-RUN] Would place fallback limit at', {
        price: params.fallbackPrice,
        symbol: params.symbol,
      });

      // In dry-run, just transition the position back to pending_entry
      this.positionManager.onRetryOrderPlaced(params.symbol, params.retryCount);
      return;
    }

    // Place stepped limit order
    const steppedResp = await this.executor.placeLimitEntry(
      params.symbol, params.side, params.steppedPrice, params.quantity, this.config.accountId,
    );

    // Place fallback limit order at original level
    const fallbackResp = await this.executor.placeLimitEntry(
      params.symbol, params.side, params.fallbackPrice, params.quantity, this.config.accountId,
    );

    if (steppedResp.success && fallbackResp.success) {
      // Track both order IDs for cancel-on-fill logic
      this.retryOrders.set(params.symbol, {
        steppedOrderId: steppedResp.orderId,
        fallbackOrderId: fallbackResp.orderId,
      });

      // Set the stepped order as the primary entry order on the position
      const pos = this.positionManager.positions.get(params.symbol);
      if (pos) {
        pos.entryOrderId = steppedResp.orderId;
        pos.dirty = true;
      }

      // Transition position back to pending_entry
      this.positionManager.onRetryOrderPlaced(params.symbol, params.retryCount);
    } else {
      logger.warn('Retry order placement failed', {
        steppedSuccess: steppedResp.success,
        fallbackSuccess: fallbackResp.success,
      });
    }
  }

  /**
   * When a retry order fills, cancel the other one.
   */
  private handleRetryFill(filledOrderId: number): void {
    for (const [symbol, orders] of this.retryOrders.entries()) {
      if (filledOrderId === orders.steppedOrderId) {
        // Stepped order filled — cancel fallback
        this.executor.cancelEntry(orders.fallbackOrderId, this.config.accountId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to cancel fallback order', { error: msg });
        });
        this.retryOrders.delete(symbol);
        return;
      }

      if (filledOrderId === orders.fallbackOrderId) {
        // Fallback filled — cancel stepped, update position's entryOrderId
        this.executor.cancelEntry(orders.steppedOrderId, this.config.accountId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to cancel stepped order', { error: msg });
        });

        // Update position to use fallback order ID
        const pos = this.positionManager.positions.get(symbol);
        if (pos) {
          pos.entryOrderId = orders.fallbackOrderId;
          pos.dirty = true;
        }

        this.retryOrders.delete(symbol);
        return;
      }
    }
  }

  /**
   * Reconcile bot position state with actual exchange positions.
   * Detects EOD auto-liquidation and other exchange-side closes.
   */
  async reconcilePositions(): Promise<void> {
    if (!this.running) return;

    try {
      const exchangePositions = await getPositions(this.config.accountId);

      // Build a set of contractIds that have non-zero size on the exchange
      const exchangeOpen = new Set<string>();
      for (const pos of exchangePositions) {
        if (pos.size !== 0) {
          exchangeOpen.add(pos.contractId);
        }
      }

      // Check each bot position against exchange state
      for (const [symbol, botPos] of this.positionManager.positions.entries()) {
        if (botPos.state === 'closed' || botPos.state === 'cancelled') continue;

        const contractId = this.config.contractIds.get(symbol);
        if (!contractId) continue;

        // Bot thinks position is active but exchange has no position
        if (!exchangeOpen.has(contractId)) {
          const exitPrice = botPos.lastPrice ?? botPos.currentSl ?? 0;
          logger.info('Position reconciliation: exchange position closed', {
            symbol,
            contractId,
            botState: botPos.state,
            exitPrice,
          });
          this.positionManager.onClose(symbol, exitPrice, 'eod_liquidation');
        }
      }

      // Check for exchange positions the bot doesn't know about
      for (const exPos of exchangePositions) {
        if (exPos.size === 0) continue;
        const symbol = this.contractToSymbol.get(exPos.contractId);
        if (!symbol) {
          logger.warn('Exchange position for unknown contract', {
            contractId: exPos.contractId,
            size: exPos.size,
          });
          continue;
        }
        const botPos = this.positionManager.positions.get(symbol);
        if (!botPos || botPos.state === 'closed' || botPos.state === 'cancelled') {
          logger.warn('Exchange has position bot does not track (manual trade?)', {
            symbol,
            contractId: exPos.contractId,
            size: exPos.size,
            averagePrice: exPos.averagePrice,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.error('Position reconciliation error', { error: msg });
    }
  }

  private async handleNewAlert(alert: AlertRow): Promise<void> {
    logger.info('Processing alert', {
      alertId: alert.id,
      symbol: alert.symbol,
      action: alert.action,
    });

    if (alert.action === 'close' || alert.action === 'close_long' || alert.action === 'close_short') {
      // Close alerts also clean up any pending retry orders
      this.cleanupRetryOrders(alert.symbol);

      this.positionManager.onAlert(alert, {
        bins: [], poc: 0, vah: 0, val: 0, totalVolume: 0, rangeHigh: 0, rangeLow: 0, barCount: 0,
      });
      return;
    }

    // Opposing signal — clean up retry orders for this symbol
    this.cleanupRetryOrders(alert.symbol);

    const bars = await fetchBars(alert.symbol, 5, 60);
    const vpvr = calculateVpvr(bars);

    if (!vpvr) {
      logger.warn('No VPVR data available, skipping alert', { alertId: alert.id });
      return;
    }

    this.positionManager.onAlert(alert, vpvr);

    // Fire-and-forget LLM analysis
    const price = alert.price ?? vpvr.poc;
    analyzeTrade({
      symbol: alert.symbol,
      action: alert.action,
      vpvrLevels: {
        poc: vpvr.poc,
        vah: vpvr.vah,
        val: vpvr.val,
        rangeHigh: vpvr.rangeHigh,
        rangeLow: vpvr.rangeLow,
      },
      confirmationScore: 0,
      price,
    }).then((result) => {
      if (result) {
        const pos = this.positionManager.positions.get(alert.symbol);
        if (pos) {
          pos.llmReasoning = result.reasoning;
          pos.llmConfidence = result.confidence;
          pos.dirty = true;
        }
      }
    }).catch(() => {
      // LLM is fire-and-forget
    });
  }

  /** Cancel any pending retry orders for a symbol (on opposing signal or close) */
  private cleanupRetryOrders(symbol: string): void {
    const orders = this.retryOrders.get(symbol);
    if (orders) {
      this.executor.cancelEntry(orders.steppedOrderId, this.config.accountId).catch(() => {});
      this.executor.cancelEntry(orders.fallbackOrderId, this.config.accountId).catch(() => {});
      this.retryOrders.delete(symbol);
    }
  }
}
