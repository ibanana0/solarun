import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface CheckpointConfig {
  id: number;
  label: string;
  lat: number;
  lng: number;
}

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface RaceEvent {
  id: string;
  name: string;
  description: string;
  location_name?: string | null;
  status:
    | "pending"
    | "active"
    | "completed"
    | "settled"
    | "Initialized"
    | "Active"
    | "Completed"
    | "Settled";
  start_time: string;
  end_time?: string;
  duration_hours: number;
  registration_fee_sol: number;
  max_participants: number;
  vault_address: string | null;
  creator_wallet: string | null;
  tx_signature?: string | null;
  start_tx_signature?: string | null;
  finalize_tx_signature?: string | null;
  checkpoints_config?: CheckpointConfig[] | null;
  route_coordinates?: RouteCoordinate[] | null;
  route_distance_meters?: number | null;
  // Staking & Protocol Fee fields (Phase 2.6)
  stake_amount?: number;
  stake_status?: "pending" | "staked" | "returned" | "slashed";
  protocol_fee_bps?: number;
  is_completed?: boolean;
  treasury_fee_collected?: number;
  // Deposit deadline fields (Phase 2.7)
  deposit_deadline?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Runner {
  id: string;
  chip_uid: string;
  wallet_address: string;
  full_name: string;
  event_id: string;
  status: "registered" | "running" | "finished" | "disqualified";
  finish_position: number | null;
  tx_signature?: string | null;
  prize_tx_signature?: string | null;
  /** Gross prize amount in USDC before protocol fee deduction (null = no prize) */
  prize_amount_gross_usdc?: number | null;
  /** Net prize amount in USDC after protocol fee deduction (what runner actually receives) */
  prize_amount_net_usdc?: number | null;
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

export interface SolaRunUser {
  id: string;
  privy_id: string;
  wallet_address: string;
  role: "creator" | "runner";
  created_at: string;
}
