use anchor_lang::prelude::*;

// ============================================================================
// EVENT ACCOUNT
// ============================================================================

#[account]
pub struct Event {
    pub event_id: String,           // UUID, max 36 chars
    pub vault: Pubkey,              // PDA vault token account address
    pub admin: Pubkey,              // Event creator
    pub mint: Pubkey,               // Mock USDC mint address
    pub status: EventStatus,        // Initialized, Active, Completed, Settled
    pub participant_count: u32,     // Total registered
    pub max_participants: u32,      // NEW: Maximum participants allowed
    pub total_deposits: u64,        // Total USDC in vault (token units)
    pub registration_fee: u64,      // Fee per participant (token units)
    pub start_time: i64,            // Unix timestamp
    pub end_time: i64,              // Unix timestamp
    pub bump: u8,                   // PDA bump seed
    pub vault_bump: u8,             // PDA vault bump seed
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
