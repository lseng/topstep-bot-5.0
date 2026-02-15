import { useQuery } from '@tanstack/react-query';

interface InformationalEventRow {
  id: string;
  created_at: string;
  source: string | null;
  raw_body: string;
  content_type: string | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface InformationalEventsResponse {
  success: boolean;
  data: InformationalEventRow[];
  pagination: PaginationMeta;
}

interface UseInformationalEventsParams {
  page?: number;
  limit?: number;
  source?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export function useInformationalEvents(params: UseInformationalEventsParams = {}) {
  return useQuery<InformationalEventsResponse>({
    queryKey: ['informational-events', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const res = await fetch(`/api/informational-events?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch informational events: ${res.status}`);
      return res.json() as Promise<InformationalEventsResponse>;
    },
    refetchInterval: 5000,
  });
}
