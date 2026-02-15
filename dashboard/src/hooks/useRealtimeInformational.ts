import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@dashboard/lib/supabase';

export function useRealtimeInformational() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('informational-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'informational_events' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['informational-events'] });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { isConnected };
}
