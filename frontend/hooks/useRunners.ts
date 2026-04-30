'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase, type Runner } from '@/lib/supabase';

export function useRunners(eventId: string) {
    const queryClient = useQueryClient();

    const query = useQuery<Runner[]>({
        queryKey: ['runners', eventId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('runners')
                .select('*')
                .eq('event_id', eventId)
                .order('finish_position', { ascending: true });

            if (error) throw error;
            return data ?? [];
        },
        enabled: !!eventId,
    });

    // Supabase Realtime subscription for live leaderboard updates
    useEffect(() => {
        if (!eventId) return;

        const channel = supabase
            .channel(`runners:${eventId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'runners',
                    filter: `event_id=eq.${eventId}`,
                },
                () => {
                    // Invalidate and refetch when any runner changes
                    queryClient.invalidateQueries({ queryKey: ['runners', eventId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [eventId, queryClient]);

    return query;
}
