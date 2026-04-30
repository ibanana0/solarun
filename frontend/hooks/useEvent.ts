'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase, type RaceEvent } from '@/lib/supabase';

export function useEvents() {
    return useQuery<RaceEvent[]>({
        queryKey: ['events'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('race_events')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data ?? [];
        },
    });
}

export function useEvent(id: string) {
    return useQuery<RaceEvent | null>({
        queryKey: ['event', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('race_events')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!id,
    });
}
