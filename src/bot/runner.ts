// Bot runner — main orchestrator wiring SignalR hubs, alert listener, position manager, executor, writer
// Supports multi-account routing: SFX alerts routed to accounts by symbol filter

import { logger } from '../lib/logger';
import { getSupabase } from '../lib/supabase';
import { authenticate, getToken, getCurrentContractId, getPositions, flattenAccount } from '../services/topstepx/client';
import { UserHubConnection, MarketHubConnection } from '../services/topstepx/streaming';
import { calculateVpvr } from '../services/vpvr/calculator';
import { fetchBars } from '../services/confirmation/engine';
import { OrderStatusNum, CONTRACT_SPECS } from '../services/topstepx/types';
import type { GatewayOrderEvent, GatewayQuoteEvent, GatewayPositionEvent } from '../services/topstepx/types';
import type { AlertRow } from '../types/database';
import type { BotConfig, ManagedPosition, PositionState, PositionSide, TradeResult, SfxTpLevels } from './types';
import { PositionManager } from './position-manager';
import { TradeExecutor } from './trade-executor';
import { SupabaseWriteQueue } from './supabase-writer';
import { AlertListener, type SfxEnrichedAlert } from './alert-listener';
import { analyzeTrade } from './llm-analyzer';

/** Per-account resources managed by the runner */
interface AccountResources {
  accountId: number;
  /** Per-account symbol filter. If set, only alerts for these symbols are routed here. */
  symbols?: string[];
  positionManager: PositionManager;
  executor: TradeExecutor;
  /** Track pending retry order IDs: symbol -> { steppedOrderId, fallbackOrderId } */
  retryOrders: Map<string, { steppedOrderId: number; fallbackOrderId: number }>;
}

/**
 * BotRunner — main orchestrator for the autonomous trading pipeline.
 *
 * Routes SFX algo alerts to accounts by symbol filter.
 * Each account has its own PositionManager and TradeExecutor.
 *
 * Lifecycle:
 *   start() -> authenticate -> connect hubs -> subscribe alerts -> run
 *   stop()  -> flush writes -> disconnect hubs -> unsubscribe alerts
 */
export class BotRunner {
  private config: BotConfig;
  private userHub: UserHubConnection;
  private marketHub: MarketHubConnection;
  private alertListener: AlertListener;
  private writeQueue: SupabaseWriteQueue;
  private running = false;

  /** Multi-account: per-account resources keyed by accountId */
  private accountResources = new Map<number, AccountResources>();

  /** Whether multi-account mode is active */
  private multiAccountMode: boolean;

  /** Primary PositionManager for backward compat (single account mode) */
  private primaryPositionManager: PositionManager;

  /** Reverse lookup: contractId -> symbol for quote routing */
  private contractToSymbol: Map<string, string>;

  /** Position reconciliation timer */
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: BotConfig) {
    this.config = config;
    this.userHub = new UserHubConnection();
    this.marketHub = new MarketHubConnection();
    this.alertListener = new AlertListener();
    this.writeQueue = new SupabaseWriteQueue(config.writeIntervalMs);
    this.multiAccountMode = !!(config.accounts && config.accounts.length > 0);

    // Build reverse lookup for quote routing
    this.contractToSymbol = new Map<string, string>();
    for (const [symbol, contractId] of config.contractIds.entries()) {
      this.contractToSymbol.set(contractId, symbol);
    }

    if (this.multiAccountMode) {
      // Multi-account mode: create per-account resources
      for (const acct of config.accounts!) {
        const pm = new PositionManager({
          accountId: acct.accountId,
          contractIds: config.contractIds,
          symbols: config.symbols,
          quantity: config.quantity,
          maxContracts: acct.maxContracts,
          maxRetries: acct.maxRetries,
          slBufferTicks: acct.slBufferTicks,
        });

        const resources: AccountResources = {
          accountId: acct.accountId,
          symbols: acct.symbols,
          positionManager: pm,
          executor: new TradeExecutor(config.dryRun),
          retryOrders: new Map(),
        };

        this.accountResources.set(acct.accountId, resources);
      }

      // Primary PM is the first account's PM (for backward compat getStatus/positions accessor)
      const firstAcct = config.accounts![0];
      this.primaryPositionManager = this.accountResources.get(firstAcct.accountId)!.positionManager;
    } else {
      // Single-account mode (backward compat)
      this.primaryPositionManager = new PositionManager({
        accountId: config.accountId,
        contractIds: config.contractIds,
        symbols: config.symbols,
        quantity: config.quantity,
        maxContracts: config.maxContracts,
        maxRetries: config.maxRetries,
        slBufferTicks: config.slBufferTicks,
      });

      const resources: AccountResources = {
        accountId: config.accountId,
        positionManager: this.primaryPositionManager,
        executor: new TradeExecutor(config.dryRun),
        retryOrders: new Map(),
      };

      this.accountResources.set(config.accountId, resources);
    }

    this.wireEvents();
  }

  /** Start the bot */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const accountIds = Array.from(this.accountResources.keys());
    logger.info('Bot starting', {
      symbols: this.config.symbols,
      accountIds,
      multiAccount: this.multiAccountMode,
      dryRun: this.config.dryRun,
    });

    // Authenticate with TopstepX
    const ok = await authenticate();
    if (!ok) throw new Error('Failed to authenticate with TopstepX');

    // Flatten all accounts: cancel working orders + close open positions
    // This ensures a clean start with no orphaned positions from previous runs
    if (!this.config.dryRun) {
      for (const accountId of accountIds) {
        try {
          const result = await flattenAccount(accountId);
          if (result.ordersCancelled > 0 || result.positionsClosed > 0) {
            logger.info('Flatten complete', {
              accountId,
              ordersCancelled: result.ordersCancelled,
              positionsClosed: result.positionsClosed,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.warn('Flatten failed (non-fatal, continuing)', { accountId, error: msg });
        }
      }
    }

    const token = await getToken();

    // Connect shared SignalR hubs
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
        this.reconcileAllPositions().catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Position reconciliation failed', { error: msg });
        });
      }, this.config.syncIntervalMs);
      logger.info('Position sync enabled', { intervalMs: this.config.syncIntervalMs });
    }

    logger.info('Bot running', {
      symbols: this.config.symbols,
      contracts: Array.from(this.config.contractIds.values()),
      accountIds,
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

  /** Primary position manager (backward compat) */
  get positions(): PositionManager {
    return this.primaryPositionManager;
  }

  /** Get position manager for a specific account */
  getPositionManager(accountId: number): PositionManager | undefined {
    return this.accountResources.get(accountId)?.positionManager;
  }

  /** Get all account IDs managed by this runner */
  getAccountIds(): number[] {
    return Array.from(this.accountResources.keys());
  }

  getStatus(): {
    running: boolean;
    userHubConnected: boolean;
    marketHubConnected: boolean;
    activePositions: number;
    pendingWrites: number;
    symbols: string[];
    contractIds: string[];
    accountIds: number[];
    multiAccountMode: boolean;
  } {
    // Sum active positions across all accounts
    let totalActive = 0;
    for (const res of this.accountResources.values()) {
      totalActive += res.positionManager.getActivePositions().length;
    }

    return {
      running: this.running,
      userHubConnected: this.userHub.isConnected,
      marketHubConnected: this.marketHub.isConnected,
      activePositions: totalActive,
      pendingWrites: this.writeQueue.pendingCount,
      symbols: this.config.symbols,
      contractIds: Array.from(this.config.contractIds.values()),
      accountIds: Array.from(this.accountResources.keys()),
      multiAccountMode: this.multiAccountMode,
    };
  }

  // --- Event Wiring ---

  private wireEvents(): void {
    // Wire events for each account's resources
    for (const resources of this.accountResources.values()) {
      this.wireAccountEvents(resources);
    }

    // Alert listener -> Route SFX alert to correct account(s) by symbol filter
    this.alertListener.on('newAlert', (enriched: SfxEnrichedAlert) => {
      const { alert, sfxTpLevels } = enriched;

      // If symbols list is non-empty, filter to only those symbols
      if (this.config.symbols.length > 0 && !this.config.symbols.includes(alert.symbol)) return;

      // Dynamic symbol resolution
      if (!this.config.contractIds.has(alert.symbol)) {
        if (!CONTRACT_SPECS[alert.symbol.toUpperCase()]) {
          logger.warn('Unknown symbol, skipping alert', { symbol: alert.symbol, alertId: alert.id });
          return;
        }

        try {
          const contractId = getCurrentContractId(alert.symbol);
          this.config.contractIds.set(alert.symbol, contractId);
          this.contractToSymbol.set(contractId, alert.symbol);
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

      // Route alert to account(s) by symbol filter
      const targets = this.resolveAlertTargets(alert);
      if (targets.length === 0) {
        logger.warn('No matching account for alert, skipping', {
          alertId: alert.id,
          symbol: alert.symbol,
        });
        return;
      }

      for (const resources of targets) {
        this.handleNewAlert(alert, resources, sfxTpLevels).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to handle alert', { alertId: alert.id, accountId: resources.accountId, error: msg });
        });
      }
    });

    // User Hub -> Route order fills to correct account PM
    this.userHub.onOrderUpdate = (event: GatewayOrderEvent): void => {
      if (event.status === (OrderStatusNum.FILLED as number) && event.fillPrice != null) {
        // Find which account's PM has this order
        for (const resources of this.accountResources.values()) {
          this.handleRetryFill(event.orderId, resources);
          resources.positionManager.onOrderFill(event.orderId, event.fillPrice);
        }
      }
    };

    // User Hub -> Route position updates by accountId
    this.userHub.onPositionUpdate = (event: GatewayPositionEvent): void => {
      const symbol = this.contractToSymbol.get(event.contractId);
      if (!symbol) return;

      // Route to correct account by accountId from the event
      const resources = this.accountResources.get(event.accountId);
      if (resources) {
        if (event.size === 0) {
          const pos = resources.positionManager.positions.get(symbol);
          if (pos && pos.state !== 'closed' && pos.state !== 'cancelled') {
            const exitPrice = event.averagePrice || pos.lastPrice || 0;
            logger.info('Exchange position closed (detected via UserHub)', {
              symbol,
              contractId: event.contractId,
              accountId: event.accountId,
              exitPrice,
            });
            resources.positionManager.onClose(symbol, exitPrice, 'eod_liquidation');
          }
        }
      } else {
        // If no account match found by event.accountId, fall back to all PMs
        for (const res of this.accountResources.values()) {
          if (event.size === 0) {
            const pos = res.positionManager.positions.get(symbol);
            if (pos && pos.state !== 'closed' && pos.state !== 'cancelled') {
              const exitPrice = event.averagePrice || pos.lastPrice || 0;
              res.positionManager.onClose(symbol, exitPrice, 'eod_liquidation');
            }
          }
        }
      }
    };

    // Market Hub -> Broadcast quotes to all PMs (market data is shared)
    this.marketHub.onQuote = (event: GatewayQuoteEvent): void => {
      const symbol = this.contractToSymbol.get(event.contractId);
      if (symbol) {
        for (const resources of this.accountResources.values()) {
          resources.positionManager.onTick(symbol, event.last, new Date(event.timestamp));
        }
      }
    };
  }

  /** Wire events for a single account's PositionManager */
  private wireAccountEvents(resources: AccountResources): void {
    const { positionManager, executor, accountId } = resources;

    // Place orders
    positionManager.on(
      'placeOrder',
      (params: { symbol: string; side: PositionSide; price: number; quantity: number; positionId: string }) => {
        executor
          .placeLimitEntry(params.symbol, params.side, params.price, params.quantity, accountId)
          .then((response) => {
            if (response.success && response.orderId > 0) {
              const pos = positionManager.positions.get(params.symbol);
              if (pos) {
                pos.entryOrderId = response.orderId;
                pos.dirty = true;
              }
            } else if (!response.success) {
              logger.warn('Order rejected by exchange', {
                symbol: params.symbol,
                positionId: params.positionId,
                accountId,
                errorCode: response.errorCode,
                errorMessage: response.errorMessage,
              });
              const pos = positionManager.positions.get(params.symbol);
              if (pos && pos.state !== 'closed' && pos.state !== 'cancelled') {
                const oldState = pos.state;
                pos.state = 'cancelled';
                pos.exitReason = `order_rejected: ${response.errorMessage ?? 'unknown'}`;
                pos.closedAt = new Date();
                pos.updatedAt = new Date();
                pos.dirty = true;
                positionManager.emit('stateChange', {
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
            logger.error('Failed to place order', { error: msg, accountId });
          });
      },
    );

    // Capacity exceeded
    positionManager.on(
      'capacityExceeded',
      (params: { symbol: string; currentMicroEquivalent: number; maxMicroEquivalent: number; requiredMicroEquivalent: number }) => {
        logger.warn('Capacity exceeded, skipping alert', {
          symbol: params.symbol,
          accountId,
          currentMicroEquivalent: params.currentMicroEquivalent,
          maxMicroEquivalent: params.maxMicroEquivalent,
          requiredMicroEquivalent: params.requiredMicroEquivalent,
        });
      },
    );

    // Cancel orders
    positionManager.on(
      'cancelOrder',
      (params: { orderId: number; positionId: string }) => {
        executor
          .cancelEntry(params.orderId, accountId)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to cancel order', { error: msg, accountId });
          });
      },
    );

    // Close positions
    positionManager.on(
      'closePosition',
      (params: { symbol: string; side: PositionSide; quantity: number; positionId: string; reason: string }) => {
        executor
          .marketClose(params.symbol, params.side, params.quantity, accountId)
          .then(() => {
            const pos = positionManager.positions.get(params.symbol);
            const exitPrice = pos?.lastPrice ?? pos?.currentSl ?? 0;
            positionManager.onClose(params.symbol, exitPrice, params.reason);
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to close position', { error: msg, accountId });
          });
      },
    );

    // Retry entry
    positionManager.on(
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
        this.handleRetryEntry(params, resources).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to handle retry entry', { error: msg, accountId });
        });
      },
    );

    // State changes -> write queue
    positionManager.on(
      'stateChange',
      (params: { positionId: string; oldState: PositionState; newState: PositionState; position: ManagedPosition }) => {
        this.writeQueue.markDirty(params.position);

        if (params.newState === 'pending_entry' && params.oldState === 'pending_entry') {
          this.writeQueue.createPosition(params.position).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            logger.error('Failed to create position in DB', { error: msg, accountId });
          });
        }
      },
    );

    // Trade logs
    positionManager.on('positionClosed', (trade: TradeResult) => {
      this.writeQueue.writeTradeLog(trade, accountId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        logger.error('Failed to write trade log', { error: msg, accountId });
      });
    });
  }

  /**
   * Resolve which account(s) should receive this alert.
   * Routes by per-account symbol filter. All accounts with matching symbol receive the alert.
   */
  private resolveAlertTargets(alert: AlertRow): AccountResources[] {
    if (!this.multiAccountMode) {
      // Single-account mode: route all alerts to the single account
      return Array.from(this.accountResources.values());
    }

    // Multi-account mode: route to all accounts whose symbol filter matches
    const results: AccountResources[] = [];
    for (const resources of this.accountResources.values()) {
      // Per-account symbol filter
      if (resources.symbols && resources.symbols.length > 0) {
        if (!resources.symbols.includes(alert.symbol.toUpperCase())) {
          continue;
        }
      }
      // No symbol filter = accept all symbols
      results.push(resources);
    }

    return results;
  }

  /**
   * Handle retry entry for a specific account.
   */
  private async handleRetryEntry(params: {
    symbol: string;
    side: PositionSide;
    steppedPrice: number;
    fallbackPrice: number;
    quantity: number;
    positionId: string;
    retryCount: number;
  }, resources: AccountResources): Promise<void> {
    const { executor, positionManager, accountId, retryOrders } = resources;

    logger.info('Placing retry entry orders', {
      symbol: params.symbol,
      side: params.side,
      accountId,
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

      positionManager.onRetryOrderPlaced(params.symbol, params.retryCount);
      return;
    }

    const steppedResp = await executor.placeLimitEntry(
      params.symbol, params.side, params.steppedPrice, params.quantity, accountId,
    );

    const fallbackResp = await executor.placeLimitEntry(
      params.symbol, params.side, params.fallbackPrice, params.quantity, accountId,
    );

    if (steppedResp.success && fallbackResp.success) {
      retryOrders.set(params.symbol, {
        steppedOrderId: steppedResp.orderId,
        fallbackOrderId: fallbackResp.orderId,
      });

      const pos = positionManager.positions.get(params.symbol);
      if (pos) {
        pos.entryOrderId = steppedResp.orderId;
        pos.dirty = true;
      }

      positionManager.onRetryOrderPlaced(params.symbol, params.retryCount);
    } else {
      logger.warn('Retry order placement failed', {
        steppedSuccess: steppedResp.success,
        fallbackSuccess: fallbackResp.success,
        accountId,
      });
    }
  }

  /**
   * When a retry order fills, cancel the other one.
   */
  private handleRetryFill(filledOrderId: number, resources: AccountResources): void {
    const { executor, positionManager, accountId, retryOrders } = resources;

    for (const [symbol, orders] of retryOrders.entries()) {
      if (filledOrderId === orders.steppedOrderId) {
        executor.cancelEntry(orders.fallbackOrderId, accountId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to cancel fallback order', { error: msg });
        });
        retryOrders.delete(symbol);
        return;
      }

      if (filledOrderId === orders.fallbackOrderId) {
        executor.cancelEntry(orders.steppedOrderId, accountId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'unknown';
          logger.error('Failed to cancel stepped order', { error: msg });
        });

        const pos = positionManager.positions.get(symbol);
        if (pos) {
          pos.entryOrderId = orders.fallbackOrderId;
          pos.dirty = true;
        }

        retryOrders.delete(symbol);
        return;
      }
    }
  }

  /**
   * Reconcile positions for all accounts.
   */
  async reconcileAllPositions(): Promise<void> {
    for (const resources of this.accountResources.values()) {
      await this.reconcilePositions(resources);
    }
  }

  /**
   * Reconcile bot position state with actual exchange positions for a specific account.
   */
  async reconcilePositions(resources?: AccountResources): Promise<void> {
    if (!this.running) return;

    // If no resources provided, reconcile for default account (backward compat)
    const targets = resources
      ? [resources]
      : Array.from(this.accountResources.values());

    for (const res of targets) {
      try {
        const exchangePositions = await getPositions(res.accountId);

        const exchangeOpen = new Set<string>();
        for (const pos of exchangePositions) {
          if (pos.size !== 0) {
            exchangeOpen.add(pos.contractId);
          }
        }

        for (const [symbol, botPos] of res.positionManager.positions.entries()) {
          if (botPos.state === 'closed' || botPos.state === 'cancelled') continue;

          const contractId = this.config.contractIds.get(symbol);
          if (!contractId) continue;

          if (!exchangeOpen.has(contractId)) {
            const exitPrice = botPos.lastPrice ?? botPos.currentSl ?? 0;
            logger.info('Position reconciliation: exchange position closed', {
              symbol,
              contractId,
              accountId: res.accountId,
              botState: botPos.state,
              exitPrice,
            });
            res.positionManager.onClose(symbol, exitPrice, 'eod_liquidation');
          }
        }

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
          const botPos = res.positionManager.positions.get(symbol);
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
        logger.error('Position reconciliation error', { error: msg, accountId: res.accountId });
      }
    }
  }

  private async handleNewAlert(alert: AlertRow, resources: AccountResources, sfxTpLevels?: SfxTpLevels): Promise<void> {
    const { positionManager, accountId } = resources;

    logger.info('Processing alert', {
      alertId: alert.id,
      symbol: alert.symbol,
      action: alert.action,
      accountId,
      sfxTp1: sfxTpLevels?.tp1,
      sfxTp2: sfxTpLevels?.tp2,
      sfxTp3: sfxTpLevels?.tp3,
    });

    if (alert.action === 'close' || alert.action === 'close_long' || alert.action === 'close_short') {
      this.cleanupRetryOrders(alert.symbol, resources);

      positionManager.onAlert(alert, {
        bins: [], poc: 0, vah: 0, val: 0, totalVolume: 0, rangeHigh: 0, rangeLow: 0, barCount: 0,
      });
      return;
    }

    this.cleanupRetryOrders(alert.symbol, resources);

    const bars = await fetchBars(alert.symbol, 5, 60);
    const vpvr = calculateVpvr(bars);

    if (!vpvr) {
      logger.warn('No VPVR data available, skipping alert', { alertId: alert.id });
      return;
    }

    positionManager.onAlert(alert, vpvr, undefined, sfxTpLevels);

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
        const pos = positionManager.positions.get(alert.symbol);
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
  private cleanupRetryOrders(symbol: string, resources: AccountResources): void {
    const { executor, accountId, retryOrders } = resources;
    const orders = retryOrders.get(symbol);
    if (orders) {
      executor.cancelEntry(orders.steppedOrderId, accountId).catch(() => {});
      executor.cancelEntry(orders.fallbackOrderId, accountId).catch(() => {});
      retryOrders.delete(symbol);
    }
  }
}
