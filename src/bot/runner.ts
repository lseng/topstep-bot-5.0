// Bot Runner — Main orchestrator
// Wires together: AlertListener → PositionManager → TradeExecutor → SupabaseWriteQueue

import { getSupabase } from '../lib/supabase';
import { TopstepXClient } from '../services/topstepx/client';
import { TopstepXStreaming } from '../services/topstepx/streaming';
import { calculateVPVR } from '../services/vpvr/calculator';
import { confirmVPVR } from '../services/confirmation/engine';
import { PositionManager } from './position-manager';
import { TradeExecutor } from './trade-executor';
import { SupabaseWriteQueue } from './supabase-writer';
import { AlertListener } from './alert-listener';
import { analyzeTrade } from './llm-analyzer';
import type { BotConfig, PositionEvent } from './types';
import type { AlertRow } from '../types/database';

export class BotRunner {
  private config: BotConfig;
  private positionManager: PositionManager;
  private executor: TradeExecutor;
  private writer: SupabaseWriteQueue;
  private alertListener: AlertListener;
  private streaming: TopstepXStreaming | null = null;
  private client: TopstepXClient;
  private running = false;
  private eventListeners: ((event: PositionEvent) => void)[] = [];

  constructor(config: BotConfig) {
    this.config = config;

    // Initialize TopstepX client
    this.client = new TopstepXClient({
      baseUrl: process.env.TOPSTEPX_BASE_URL ?? 'https://gateway.projectx.com',
      username: process.env.TOPSTEPX_USERNAME ?? '',
      apiKey: process.env.TOPSTEPX_API_KEY ?? '',
    });

    // Initialize components
    this.positionManager = new PositionManager(config);
    this.executor = new TradeExecutor(this.client, config.dryRun);

    const supabase = getSupabase();
    this.writer = new SupabaseWriteQueue(
      supabase,
      () => this.positionManager.getAllPositions(),
      () => this.positionManager.flushDirty(),
    );

    this.alertListener = new AlertListener(supabase, (alert) => {
      void this.handleAlert(alert);
    });

    // Forward position events
    this.positionManager.onEvent((event) => {
      this.eventListeners.forEach((cb) => cb(event));
      this.handlePositionEvent(event);
    });
  }

  /** Register event listener */
  onEvent(callback: (event: PositionEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /** Start the bot */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start Supabase write queue
    this.writer.start();

    // Start alert listener
    this.alertListener.start();

    // Connect SignalR streaming
    if (!this.config.dryRun) {
      try {
        const token = await this.client.getToken();
        this.streaming = new TopstepXStreaming(
          {
            marketHubUrl: process.env.TOPSTEPX_MARKET_HUB_URL ?? 'https://gateway.projectx.com/hubs/market',
            userHubUrl: process.env.TOPSTEPX_USER_HUB_URL ?? 'https://gateway.projectx.com/hubs/user',
          },
          token,
        );

        await this.streaming.connect();
        await this.streaming.subscribeUserEvents(this.config.accountId);

        // Handle ticks
        this.streaming.onTick((tick) => {
          this.positionManager.onTick(tick.contractId, tick.price);
        });

        // Handle fills
        this.streaming.onFill((fill) => {
          // Find the position with this order ID
          const positions = this.positionManager.getActivePositions();
          const pos = positions.find((p) => p.entryOrderId === fill.orderId);
          if (pos) {
            this.positionManager.onFill(pos.id, fill.price);
          }
        });
      } catch (err) {
        console.error('Failed to connect SignalR:', err);
      }
    }
  }

  /** Stop the bot gracefully */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    await this.alertListener.stop();
    if (this.streaming) {
      await this.streaming.disconnect();
    }
    await this.writer.stop();
  }

  /** Handle a new alert */
  private async handleAlert(alert: AlertRow): Promise<void> {
    const action = alert.action;

    // Handle close actions
    if (action === 'close' || action === 'close_long' || action === 'close_short') {
      const events = this.positionManager.onOpposingAlert(alert.symbol, action);
      for (const event of events) {
        if (event.type === 'closed') {
          const pos = this.positionManager.getPosition(event.positionId);
          if (pos && pos.entryOrderId) {
            await this.executor.closePosition(pos);
          }
        }
      }
      return;
    }

    // Handle buy/sell — cancel opposing, then open new position
    this.positionManager.onOpposingAlert(alert.symbol, action);

    try {
      // Fetch 5M bars for VPVR
      const barsResponse = await this.client.getHistoricalBars({
        contractId: this.config.contractId,
        barType: 'Minute',
        barInterval: 5,
        startDate: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // Last 4 hours
        endDate: new Date().toISOString(),
      });

      if (!barsResponse.bars || barsResponse.bars.length === 0) {
        console.error('No historical bars available for VPVR');
        return;
      }

      // Calculate VPVR
      const vpvr5M = calculateVPVR(barsResponse.bars);

      // Calculate 1M VPVR for confirmation (using 5M bars as approximation)
      const vpvr1M = vpvr5M; // In production, would fetch 1M bars separately
      const confirmation = confirmVPVR(vpvr1M, vpvr5M);

      // Open position
      const positionId = crypto.randomUUID();
      const pos = this.positionManager.openPosition(
        positionId,
        alert.id,
        alert.symbol,
        action,
        alert.quantity,
        vpvr5M,
        confirmation.score,
      );

      // Place limit order
      const orderResult = await this.executor.placeLimitOrder(pos);
      if (orderResult.success && orderResult.orderId) {
        this.positionManager.setEntryOrderId(positionId, orderResult.orderId);
      }

      // Fire-and-forget LLM analysis
      void analyzeTrade({
        symbol: alert.symbol,
        action,
        vpvr: vpvr5M,
        confirmationScore: confirmation.score,
        targetEntry: pos.targetEntryPrice,
        tp1: pos.tp1Price,
        tp2: pos.tp2Price,
        tp3: pos.tp3Price,
        initialSl: pos.initialSl,
      }).then((analysis) => {
        if (analysis) {
          this.positionManager.setLLMData(positionId, analysis.reasoning, analysis.confidence);
        }
      });

      // Subscribe to market data for this contract
      if (this.streaming) {
        await this.streaming.subscribeMarketData(this.config.contractId);
      }
    } catch (err) {
      console.error('Failed to handle alert:', err);
    }
  }

  /** Handle position events (e.g., close on SL breach) */
  private handlePositionEvent(event: PositionEvent): void {
    if (event.type === 'sl_breached') {
      const pos = this.positionManager.getPosition(event.positionId);
      if (pos) {
        void this.executor.closePosition(pos);
      }
    }
  }

  /** Get bot status for CLI display */
  getStatus(): {
    running: boolean;
    activePositions: number;
    totalPositions: number;
  } {
    return {
      running: this.running,
      activePositions: this.positionManager.getActivePositions().length,
      totalPositions: this.positionManager.getAllPositions().length,
    };
  }

  getPositionManager(): PositionManager {
    return this.positionManager;
  }
}
