// Supabase Database Types
// Generated types for the TopstepX Trading Bot database

export type TradeAction = 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type AlertStatus = 'received' | 'processing' | 'executed' | 'failed' | 'cancelled';

export interface Database {
  public: {
    Tables: {
      alerts: {
        Row: {
          id: string;
          created_at: string;
          symbol: string;
          action: TradeAction;
          quantity: number;
          order_type: OrderType | null;
          price: number | null;
          stop_loss: number | null;
          take_profit: number | null;
          comment: string | null;
          status: AlertStatus;
          error_message: string | null;
          order_id: string | null;
          executed_at: string | null;
          raw_payload: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          created_at?: string;
          symbol: string;
          action: TradeAction;
          quantity: number;
          order_type?: OrderType | null;
          price?: number | null;
          stop_loss?: number | null;
          take_profit?: number | null;
          comment?: string | null;
          status?: AlertStatus;
          error_message?: string | null;
          order_id?: string | null;
          executed_at?: string | null;
          raw_payload: Record<string, unknown>;
        };
        Update: {
          id?: string;
          created_at?: string;
          symbol?: string;
          action?: TradeAction;
          quantity?: number;
          order_type?: OrderType | null;
          price?: number | null;
          stop_loss?: number | null;
          take_profit?: number | null;
          comment?: string | null;
          status?: AlertStatus;
          error_message?: string | null;
          order_id?: string | null;
          executed_at?: string | null;
          raw_payload?: Record<string, unknown>;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      trade_action: TradeAction;
      order_type: OrderType;
      alert_status: AlertStatus;
    };
  };
}

// Helper type for inserting alerts
export type AlertInsert = Database['public']['Tables']['alerts']['Insert'];
export type AlertRow = Database['public']['Tables']['alerts']['Row'];
export type AlertUpdate = Database['public']['Tables']['alerts']['Update'];
