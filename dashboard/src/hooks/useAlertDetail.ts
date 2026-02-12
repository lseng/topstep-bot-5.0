import { useQuery } from '@tanstack/react-query';

interface AlertDetailResponse {
  success: boolean;
  data: {
    id: string;
    created_at: string;
    symbol: string;
    action: string;
    quantity: number;
    order_type: string | null;
    price: number | null;
    stop_loss: number | null;
    take_profit: number | null;
    comment: string | null;
    status: string;
    error_message: string | null;
    order_id: string | null;
    executed_at: string | null;
    raw_payload: Record<string, unknown>;
    ohlcv?: {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
    };
  };
}

export function useAlertDetail(id: string | null) {
  return useQuery<AlertDetailResponse>({
    queryKey: ['alert', id],
    queryFn: async () => {
      const res = await fetch(`/api/alerts/${id}`);
      if (!res.ok) throw new Error(`Failed to fetch alert: ${res.status}`);
      return res.json() as Promise<AlertDetailResponse>;
    },
    enabled: !!id,
  });
}
