import { useQuery } from '@tanstack/react-query';

interface AlertRow {
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
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AlertsResponse {
  success: boolean;
  data: AlertRow[];
  pagination: PaginationMeta;
}

interface UseAlertsParams {
  page?: number;
  limit?: number;
  symbol?: string;
  action?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
  name?: string;
}

export function useAlerts(params: UseAlertsParams = {}) {
  return useQuery<AlertsResponse>({
    queryKey: ['alerts', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const res = await fetch(`/api/alerts?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch alerts: ${res.status}`);
      return res.json() as Promise<AlertsResponse>;
    },
    refetchInterval: 5000,
  });
}
