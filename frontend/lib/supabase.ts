import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface RaceEvent {
    id: string;
    name: string;
    description: string;
    status: 'pending' | 'active' | 'completed' | 'settled';
    start_time: string;
    end_time: string;
    registration_fee_sol: number;
    max_participants: number;
    vault_address: string | null;
    created_at: string;
}

export interface Runner {
    id: string;
    chip_uid: string;
    wallet_address: string;
    full_name: string;
    event_id: string;
    status: 'registered' | 'running' | 'finished' | 'disqualified';
    finish_position: number | null;
    created_at: string;
    updated_at: string;
}

export interface RaceLog {
    id: number;
    runner_id: string;
    checkpoint_id: number;
    timestamp: string;
    created_at: string;
}
