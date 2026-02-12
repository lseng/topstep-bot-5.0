import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@dashboard/lib/supabase';

export function useRealtimeAlerts() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['alerts'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        (payload) => {
          void queryClient.refetchQueries({ queryKey: ['alerts'] });
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            void queryClient.refetchQueries({
              queryKey: ['alert', (payload.new as { id: string }).id],
            });
          }
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
