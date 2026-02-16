// Alert listener — subscribes to Supabase Realtime for new SFX algo alerts

import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import type { AlertRow, SfxAlgoAlertRow, Database } from '../types/database';
import type { SfxTpLevels } from './types';

/** Alert with optional SFX TP levels attached */
export interface SfxEnrichedAlert {
  alert: AlertRow;
  sfxTpLevels?: SfxTpLevels;
}

/**
 * Listens for new SFX algo alerts via Supabase Realtime INSERT events.
 *
 * Filters for buy/sell entry alerts only (skips TP1/TP2/TP3/sl exits).
 * Transforms SfxAlgoAlertRow into AlertRow shape for the position manager.
 * Emits 'newAlert' event with SfxEnrichedAlert (alert + optional TP levels).
 */
export class AlertListener extends EventEmitter {
  private channel: RealtimeChannel | null = null;

  /**
   * Start listening for new SFX algo alerts.
   */
  start(supabaseClient: SupabaseClient<Database>): void {
    if (this.channel) return;

    this.channel = supabaseClient
      .channel('bot-sfx-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sfx_algo_alerts',
        },
        (payload) => {
          try {
            const sfxAlert = payload.new as SfxAlgoAlertRow;

            // Only process buy/sell entry alerts (skip TP1/TP2/TP3/sl exits)
            const alertType = sfxAlert.alert_type?.toLowerCase();
            if (alertType !== 'buy' && alertType !== 'sell') return;

            // Must have a symbol
            if (!sfxAlert.symbol) return;

            // Transform SFX alert into AlertRow shape for position manager
            const alert = transformSfxToAlert(sfxAlert);

            // Extract SFX TP levels and stop loss if present
            let sfxTpLevels: SfxTpLevels | undefined;
            if (sfxAlert.tp1 != null && sfxAlert.tp2 != null && sfxAlert.tp3 != null) {
              sfxTpLevels = {
                tp1: sfxAlert.tp1,
                tp2: sfxAlert.tp2,
                tp3: sfxAlert.tp3,
                stopLoss: sfxAlert.stop_loss ?? undefined,
              };
            }

            logger.info('New SFX alert received', {
              alertId: sfxAlert.id,
              symbol: sfxAlert.symbol,
              action: alertType,
              direction: sfxAlert.signal_direction,
              price: sfxAlert.price,
              tp1: sfxAlert.tp1,
              tp2: sfxAlert.tp2,
              tp3: sfxAlert.tp3,
            });

            this.emit('newAlert', { alert, sfxTpLevels } satisfies SfxEnrichedAlert);
          } catch (err) {
            logger.error('Error processing SFX alert', { error: err instanceof Error ? err.message : String(err) });
          }
        },
      )
      .subscribe((status) => {
        const s = String(status);
        if (s === 'SUBSCRIBED') {
          logger.info('SFX alert listener subscribed to Realtime');
        } else if (s === 'CHANNEL_ERROR') {
          logger.error('SFX alert listener channel error');
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
      logger.info('SFX alert listener unsubscribed');
    }
  }
}

/**
 * Transform an SFX algo alert row into the AlertRow shape used by the position manager.
 * Maps SFX fields to corresponding AlertRow fields.
 */
function transformSfxToAlert(sfx: SfxAlgoAlertRow): AlertRow {
  const action = sfx.alert_type?.toLowerCase() === 'buy' ? 'buy' : 'sell';

  return {
    id: sfx.id,
    created_at: sfx.created_at,
    symbol: sfx.symbol!,  // Already checked for null above
    action: action as AlertRow['action'],
    quantity: 1,
    order_type: null,
    price: sfx.price,
    stop_loss: sfx.stop_loss,
    take_profit: null,
    comment: null,
    status: 'received',
    error_message: null,
    order_id: null,
    executed_at: null,
    raw_payload: {
      source: 'sfx-algo',
      ticker: sfx.ticker,
      signal_direction: sfx.signal_direction,
      current_rating: sfx.current_rating,
      tp1: sfx.tp1,
      tp2: sfx.tp2,
      tp3: sfx.tp3,
      stop_loss: sfx.stop_loss,
      unix_time: sfx.unix_time,
    },
    strategy: 'sfx-algo',
    name: null,
  };
}
