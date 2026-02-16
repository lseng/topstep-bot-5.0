import { useQuery } from '@tanstack/react-query';

interface SfxAlgoAlertRow {
  id: string;
  created_at: string;
  source: string | null;
  raw_body: string;
  content_type: string | null;
  ticker: string | null;
  symbol: string | null;
  alert_type: string | null;
  signal_direction: string | null;
  price: number | null;
  current_rating: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stop_loss: number | null;
  entry_price: number | null;
  unix_time: number | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SfxAlgoAlertsResponse {
  success: boolean;
  data: SfxAlgoAlertRow[];
  pagination: PaginationMeta;
}

interface UseSfxAlgoAlertsParams {
  page?: number;
  limit?: number;
  source?: string;
  symbol?: string;
  alert_type?: string;
  signal_direction?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export function useSfxAlgoAlerts(params: UseSfxAlgoAlertsParams = {}) {
  return useQuery<SfxAlgoAlertsResponse>({
    queryKey: ['sfx-algo-alerts', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const res = await fetch(`/api/sfx-algo-alerts?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch sfx-algo alerts: ${res.status}`);
      return res.json() as Promise<SfxAlgoAlertsResponse>;
    },
    refetchInterval: 5000,
  });
}
