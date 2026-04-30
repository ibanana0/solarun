'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase, type RaceLog } from '@/lib/supabase';

export interface RaceLogWithRunner extends RaceLog {
    runners: {
        full_name: string;
        chip_uid: string;
    };
}

export function useRaceLogs(eventId: string) {
    return useQuery<RaceLogWithRunner[]>({
        queryKey: ['race_logs', eventId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('race_logs')
                .select(`
                    *,
                    runners!inner (
                        full_name,
                        chip_uid
                    )
                `)
                .eq('runners.event_id', eventId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return (data ?? []) as RaceLogWithRunner[];
        },
        enabled: !!eventId,
        refetchInterval: 10000, // Refetch every 10 seconds as a fallback
    });
}
