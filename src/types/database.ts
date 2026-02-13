// Supabase Database Types
// Generated types for the TopstepX Trading Bot database

export type TradeAction = 'buy' | 'sell' | 'close' | 'close_long' | 'close_short';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type AlertStatus = 'received' | 'processing' | 'executed' | 'failed' | 'cancelled';
export type PositionState = 'pending_entry' | 'active' | 'tp1_hit' | 'tp2_hit' | 'tp3_hit' | 'closed' | 'cancelled' | 'pending_retry';
export type PositionSide = 'long' | 'short';

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
          /** Strategy name parsed from raw_payload (e.g. 'vpvr', 'scalper'). Null = default vpvr. */
          strategy: string | null;
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
          strategy?: string | null;
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
          strategy?: string | null;
        };
      };
      positions: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          alert_id: string | null;
          symbol: string;
          side: PositionSide;
          state: PositionState;
          entry_order_id: number | null;
          entry_price: number | null;
          target_entry_price: number | null;
          quantity: number;
          contract_id: string;
          account_id: number;
          current_sl: number | null;
          initial_sl: number | null;
          tp1_price: number | null;
          tp2_price: number | null;
          tp3_price: number | null;
          unrealized_pnl: number | null;
          last_price: number | null;
          vpvr_data: Record<string, unknown> | null;
          confirmation_score: number | null;
          exit_price: number | null;
          exit_reason: string | null;
          closed_at: string | null;
          llm_reasoning: string | null;
          llm_confidence: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          alert_id?: string | null;
          symbol: string;
          side: PositionSide;
          state?: PositionState;
          entry_order_id?: number | null;
          entry_price?: number | null;
          target_entry_price?: number | null;
          quantity: number;
          contract_id: string;
          account_id: number;
          current_sl?: number | null;
          initial_sl?: number | null;
          tp1_price?: number | null;
          tp2_price?: number | null;
          tp3_price?: number | null;
          unrealized_pnl?: number | null;
          last_price?: number | null;
          vpvr_data?: Record<string, unknown> | null;
          confirmation_score?: number | null;
          exit_price?: number | null;
          exit_reason?: string | null;
          closed_at?: string | null;
          llm_reasoning?: string | null;
          llm_confidence?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          alert_id?: string | null;
          symbol?: string;
          side?: PositionSide;
          state?: PositionState;
          entry_order_id?: number | null;
          entry_price?: number | null;
          target_entry_price?: number | null;
          quantity?: number;
          contract_id?: string;
          account_id?: number;
          current_sl?: number | null;
          initial_sl?: number | null;
          tp1_price?: number | null;
          tp2_price?: number | null;
          tp3_price?: number | null;
          unrealized_pnl?: number | null;
          last_price?: number | null;
          vpvr_data?: Record<string, unknown> | null;
          confirmation_score?: number | null;
          exit_price?: number | null;
          exit_reason?: string | null;
          closed_at?: string | null;
          llm_reasoning?: string | null;
          llm_confidence?: number | null;
        };
      };
      trades_log: {
        Row: {
          id: string;
          created_at: string;
          position_id: string | null;
          alert_id: string | null;
          symbol: string;
          side: PositionSide;
          entry_price: number;
          entry_time: string;
          exit_price: number;
          exit_time: string;
          exit_reason: string;
          quantity: number;
          gross_pnl: number;
          fees: number | null;
          net_pnl: number;
          vpvr_poc: number | null;
          vpvr_vah: number | null;
          vpvr_val: number | null;
          highest_tp_hit: string | null;
          confirmation_score: number | null;
          llm_reasoning: string | null;
          metadata: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          position_id?: string | null;
          alert_id?: string | null;
          symbol: string;
          side: PositionSide;
          entry_price: number;
          entry_time: string;
          exit_price: number;
          exit_time: string;
          exit_reason: string;
          quantity: number;
          gross_pnl: number;
          fees?: number | null;
          net_pnl: number;
          vpvr_poc?: number | null;
          vpvr_vah?: number | null;
          vpvr_val?: number | null;
          highest_tp_hit?: string | null;
          confirmation_score?: number | null;
          llm_reasoning?: string | null;
          metadata?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          position_id?: string | null;
          alert_id?: string | null;
          symbol?: string;
          side?: PositionSide;
          entry_price?: number;
          entry_time?: string;
          exit_price?: number;
          exit_time?: string;
          exit_reason?: string;
          quantity?: number;
          gross_pnl?: number;
          fees?: number | null;
          net_pnl?: number;
          vpvr_poc?: number | null;
          vpvr_vah?: number | null;
          vpvr_val?: number | null;
          highest_tp_hit?: string | null;
          confirmation_score?: number | null;
          llm_reasoning?: string | null;
          metadata?: Record<string, unknown> | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      trade_action: TradeAction;
      order_type: OrderType;
      alert_status: AlertStatus;
      position_state: PositionState;
      position_side: PositionSide;
    };
  };
}

// Helper types for alerts
export type AlertInsert = Database['public']['Tables']['alerts']['Insert'];
export type AlertRow = Database['public']['Tables']['alerts']['Row'];
export type AlertUpdate = Database['public']['Tables']['alerts']['Update'];

// Helper types for positions
export type PositionRow = Database['public']['Tables']['positions']['Row'];
export type PositionInsert = Database['public']['Tables']['positions']['Insert'];
export type PositionUpdate = Database['public']['Tables']['positions']['Update'];

// Helper types for trades_log
export type TradesLogRow = Database['public']['Tables']['trades_log']['Row'];
export type TradesLogInsert = Database['public']['Tables']['trades_log']['Insert'];
