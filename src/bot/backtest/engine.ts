// Backtest Engine — Fetch alerts, simulate trades, aggregate results

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, AlertRow } from '../../types/database';
import type { TopstepXClient } from '../../services/topstepx/client';
import { simulateTrade } from './simulator';
import type { BacktestConfig, BacktestResult, SimulatedTrade } from './types';

export class BacktestEngine {
  private supabase: SupabaseClient<Database>;
  private client: TopstepXClient;

  constructor(supabase: SupabaseClient<Database>, client: TopstepXClient) {
    this.supabase = supabase;
    this.client = client;
  }

  /** Run backtest against stored alerts */
  async run(config: BacktestConfig): Promise<BacktestResult> {
    const alerts = await this.fetchAlerts(config);
    const trades: SimulatedTrade[] = [];

    for (const alert of alerts) {
      if (alert.action !== 'buy' && alert.action !== 'sell') continue;

      try {
        const barsResponse = await this.client.getHistoricalBars({
          contractId: config.contractId,
          barType: 'Minute',
          barInterval: 5,
          startDate: new Date(new Date(alert.created_at).getTime() - 4 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(new Date(alert.created_at).getTime() + 4 * 60 * 60 * 1000).toISOString(),
        });

        if (!barsResponse.bars || barsResponse.bars.length === 0) continue;

        const trade = simulateTrade({
          alertId: alert.id,
          symbol: alert.symbol,
          action: alert.action,
          quantity: alert.quantity,
          alertTime: alert.created_at,
          bars: barsResponse.bars,
        });

        if (trade) {
          trades.push(trade);
        }
      } catch {
        // Skip alerts that fail to fetch bars
        continue;
      }
    }

    return this.aggregateResults(trades);
  }

  private async fetchAlerts(config: BacktestConfig): Promise<AlertRow[]> {
    let query = this.supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: true });

    if (config.symbol) {
      query = query.eq('symbol', config.symbol);
    }
    if (config.fromDate) {
      query = query.gte('created_at', config.fromDate);
    }
    if (config.toDate) {
      query = query.lte('created_at', config.toDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch alerts: ${error.message}`);
    return (data ?? []) as AlertRow[];
  }

  private aggregateResults(trades: SimulatedTrade[]): BacktestResult {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgPnl: 0,
        totalPnl: 0,
        profitFactor: 0,
        largestWin: 0,
        largestLoss: 0,
        trades: [],
      };
    }

    const winningTrades = trades.filter((t) => t.grossPnl > 0);
    const losingTrades = trades.filter((t) => t.grossPnl <= 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.grossPnl, 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.grossPnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.grossPnl, 0));

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / trades.length) * 100,
      avgPnl: totalPnl / trades.length,
      totalPnl,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.grossPnl)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.grossPnl)) : 0,
      trades,
    };
  }
}
