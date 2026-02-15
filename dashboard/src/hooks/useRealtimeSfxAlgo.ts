import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@dashboard/lib/supabase';

export function useRealtimeSfxAlgo() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('sfx-algo-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sfx_algo_alerts' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['sfx-algo-alerts'] });
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
