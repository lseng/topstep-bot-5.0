import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@dashboard/lib/supabase';

export function useRealtimePositions() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('positions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'positions' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['positions'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'positions' },
        () => {
          void queryClient.refetchQueries({ queryKey: ['positions'] });
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
