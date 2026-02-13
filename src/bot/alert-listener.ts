// Alert Listener — Supabase Realtime subscription for new alerts

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Database, AlertRow } from '../types/database';

type AlertCallback = (alert: AlertRow) => void;

export class AlertListener {
  private supabase: SupabaseClient<Database>;
  private channel: RealtimeChannel | null = null;
  private callback: AlertCallback;

  constructor(supabase: SupabaseClient<Database>, callback: AlertCallback) {
    this.supabase = supabase;
    this.callback = callback;
  }

  /** Start listening for new alerts */
  start(): void {
    if (this.channel) return;

    this.channel = this.supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: 'status=eq.received',
        },
        (payload) => {
          const alert = payload.new as AlertRow;
          this.callback(alert);
        },
      )
      .subscribe();
  }

  /** Stop listening */
  async stop(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
