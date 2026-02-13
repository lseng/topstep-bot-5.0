// Alert listener — subscribes to Supabase Realtime for new alerts

import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import type { AlertRow, Database } from '../types/database';

/**
 * Listens for new alerts via Supabase Realtime INSERT events.
 *
 * Filters for status='received' and buy/sell/close actions.
 * Emits 'newAlert' event with parsed AlertRow.
 */
export class AlertListener extends EventEmitter {
  private channel: RealtimeChannel | null = null;

  /**
   * Start listening for new alerts.
   */
  start(supabaseClient: SupabaseClient<Database>): void {
    if (this.channel) return;

    this.channel = supabaseClient
      .channel('bot-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
        },
        (payload) => {
          const alert = payload.new as AlertRow;

          // Only process received alerts with actionable actions
          if (alert.status !== 'received') return;

          const validActions = ['buy', 'sell', 'close', 'close_long', 'close_short'];
          if (!validActions.includes(alert.action)) return;

          logger.info('New alert received', {
            alertId: alert.id,
            symbol: alert.symbol,
            action: alert.action,
          });

          this.emit('newAlert', alert);
        },
      )
      .subscribe((status) => {
        const s = String(status);
        if (s === 'SUBSCRIBED') {
          logger.info('Alert listener subscribed to Realtime');
        } else if (s === 'CHANNEL_ERROR') {
          logger.error('Alert listener channel error');
        }
      });
  }

  /**
   * Stop listening and unsubscribe from Realtime.
   */
  async stop(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
      logger.info('Alert listener unsubscribed');
    }
  }
}
