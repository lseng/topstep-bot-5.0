import { useQuery } from '@tanstack/react-query';

interface TradeLogRow {
  id: string;
  created_at: string;
  position_id: string | null;
  alert_id: string | null;
  symbol: string;
  side: 'long' | 'short';
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
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TradeLogResponse {
  success: boolean;
  data: TradeLogRow[];
  pagination: PaginationMeta;
}

interface UseTradeLogParams {
  page?: number;
  limit?: number;
  symbol?: string;
  side?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export type { TradeLogRow };

export function useTradeLog(params: UseTradeLogParams = {}) {
  return useQuery<TradeLogResponse>({
    queryKey: ['trades-log', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const res = await fetch(`/api/trades-log?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch trade log: ${res.status}`);
      return res.json() as Promise<TradeLogResponse>;
    },
    refetchInterval: 5000,
  });
}
