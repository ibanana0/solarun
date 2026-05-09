'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase, type Runner } from '@/lib/supabase';

export type RunnerWithLogs = Runner & {
    last_checkpoint_id: number;
    last_checkpoint_time: string | null;
    race_logs: { checkpoint_id: number; timestamp: string }[];
};

export function useRunners(eventId: string) {
    const queryClient = useQueryClient();

    const query = useQuery<RunnerWithLogs[]>({
        queryKey: ['runners', eventId],
        queryFn: async () => {
            // Fetch runners and their race logs in one query
            const { data, error } = await supabase
                .from('runners')
                .select('*, race_logs(checkpoint_id, timestamp)')
                .eq('event_id', eventId)
                .order('finish_position', { ascending: true });

            if (error) throw error;
            
            // Process the raw data to extract the latest checkpoint info
            const processedRunners = (data ?? []).map((runner: any) => {
                let lastCp = -1;
                let lastTime = null;
                
                if (runner.race_logs && runner.race_logs.length > 0) {
                    // Sort logs to find the highest checkpoint
                    const sortedLogs = runner.race_logs.sort((a: any, b: any) => b.checkpoint_id - a.checkpoint_id);
                    lastCp = sortedLogs[0].checkpoint_id;
                    lastTime = sortedLogs[0].timestamp;
                }

                // Clean up the object (keep race_logs for history popup)
                const { ...rest } = runner;
                
                return {
                    ...rest,
                    last_checkpoint_id: lastCp,
                    last_checkpoint_time: lastTime,
                    race_logs: runner.race_logs || [],
                } as RunnerWithLogs;
            });

            return processedRunners;
        },
        enabled: !!eventId,
    });

    // Supabase Realtime subscriptions for live leaderboard updates
    useEffect(() => {
        if (!eventId) return;

        // Channel for runners table
        const runnersChannel = supabase
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
                    queryClient.invalidateQueries({ queryKey: ['runners', eventId] });
                }
            )
            .subscribe();

        // Channel for race_logs table (to catch CP1 updates)
        // Note: Supabase doesn't support filtering by foreign table columns directly in realtime.
        // So we just listen to all race_logs and invalidate the query.
        const logsChannel = supabase
            .channel(`race_logs:all`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'race_logs',
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['runners', eventId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(runnersChannel);
            supabase.removeChannel(logsChannel);
        };
    }, [eventId, queryClient]);

    return query;
}
