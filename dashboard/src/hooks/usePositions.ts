import { useQuery } from '@tanstack/react-query';

interface PositionRow {
  id: string;
  alert_id: string;
  symbol: string;
  side: 'long' | 'short';
  state: string;
  entry_price: number | null;
  target_entry_price: number | null;
  quantity: number;
  current_sl: number | null;
  initial_sl: number | null;
  tp1_price: number | null;
  tp2_price: number | null;
  tp3_price: number | null;
  unrealized_pnl: number;
  vpvr_poc: number | null;
  vpvr_vah: number | null;
  vpvr_val: number | null;
  llm_reasoning: string | null;
  llm_confidence: number | null;
  created_at: string;
  updated_at: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PositionsResponse {
  success: boolean;
  data: PositionRow[];
  pagination: PaginationMeta;
}

interface UsePositionsParams {
  page?: number;
  limit?: number;
  symbol?: string;
  state?: string;
  side?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export type { PositionRow };

export function usePositions(params: UsePositionsParams = {}) {
  return useQuery<PositionsResponse>({
    queryKey: ['positions', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const res = await fetch(`/api/positions?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
      return res.json() as Promise<PositionsResponse>;
    },
    refetchInterval: 5000,
  });
}
