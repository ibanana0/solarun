use anchor_lang::prelude::*;

// ============================================================================
// GLOBAL STATE ACCOUNT (Protocol Configuration)
// ============================================================================

#[account]
pub struct GlobalState {
    pub treasury_address: Pubkey,   // Wallet address to receive protocol fees
    pub protocol_fee_bps: u16,      // Protocol fee in basis points (e.g., 500 = 5%)
    pub bump: u8,                   // PDA bump seed
}

// ============================================================================
// EVENT ACCOUNT
// ============================================================================

#[account]
pub struct Event {
    pub event_id: String,           // UUID, max 36 chars
    pub vault: Pubkey,              // PDA vault token account address
    pub stake_vault: Pubkey,        // PDA vault for admin's stake deposit
    pub admin: Pubkey,              // Event creator
    pub mint: Pubkey,               // Mock USDC mint address
    pub status: EventStatus,        // Initialized, Active, Completed, Settled
    pub participant_count: u32,     // Total registered
    pub max_participants: u32,      // Maximum participants allowed
    pub total_deposits: u64,        // Total USDC in vault (token units)
    pub registration_fee: u64,      // Fee per participant (token units)
    pub stake_amount: u64,          // Amount staked by admin (token units)
    pub is_completed: bool,         // Whether completion was processed (prevents double-spending)
    pub start_time: i64,            // Unix timestamp
    pub end_time: i64,              // Unix timestamp
    pub dispute_lock_until: i64,    // UTC timestamp when stake can be released
    pub dispute_lock_seconds: i64,  // Duration of dispute lock in seconds
    pub bump: u8,                   // PDA bump seed
    pub vault_bump: u8,             // PDA vault bump seed
    pub stake_vault_bump: u8,       // Stake vault PDA bump seed
}

// ============================================================================
// STAKE VAULT ACCOUNT (Holds admin's stake deposit)
// ============================================================================

#[account]
pub struct StakeVault {
    pub event: Pubkey,              // Reference to associated Event account
    pub admin: Pubkey,              // Event admin who deposited the stake
    pub vault: Pubkey,              // PDA token account for this stake
    pub amount: u64,                // Amount staked (token units)
    pub is_slashed: bool,           // Whether stake was slashed as penalty
    pub bump: u8,                   // PDA bump seed
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum EventStatus {
    Initialized,
    Active,
    Completed,
    Settled,
}

impl EventStatus {
    pub fn to_u8(&self) -> u8 {
        match self {
            EventStatus::Initialized => 0,
            EventStatus::Active => 1,
            EventStatus::Completed => 2,
            EventStatus::Settled => 3,
        }
    }
}

// ============================================================================
// PARTICIPANT ACCOUNT (REGISTRY)
// ============================================================================

#[account]
pub struct Participant {
    pub runner_id: String,                  // UUID from Supabase, max 36 chars
    pub wallet: Pubkey,                     // Participant's wallet
    pub chip_uid: String,                   // RFID chip UID, max 20 chars
    pub full_name: String,                  // Name, max 50 chars
    pub finish_position: Option<u8>,        // 1, 2, 3, 4, ... or None
    pub status: ParticipantStatus,          // Registered, Running, Finished, etc
    pub last_checkpoint: u8,                // 0=Start, 1=CP1, 2=Finish
    pub last_checkpoint_at: i64,            // Precise IoT timestamp
    pub registered_at: i64,                 // Unix timestamp
    pub finished_at: Option<i64>,           // Unix timestamp or None
    pub bump: u8,                           // PDA bump seed
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ParticipantStatus {
    Registered,
    Running,
    Finished,
    Disqualified,
    Refunded,
}

impl ParticipantStatus {
    pub fn to_u8(&self) -> u8 {
        match self {
            ParticipantStatus::Registered => 0,
            ParticipantStatus::Running => 1,
            ParticipantStatus::Finished => 2,
            ParticipantStatus::Disqualified => 3,
            ParticipantStatus::Refunded => 4,
        }
    }
}
