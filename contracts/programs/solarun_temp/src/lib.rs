pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::{Event, EventStatus, GlobalState, Participant, ParticipantStatus, StakeVault};

declare_id!("E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8");

#[program]
pub mod solarun_temp {
    use super::*;

    /// Create the global Mock USDC mint (one-time setup)
    pub fn create_mock_mint(ctx: Context<CreateMockMint>) -> Result<()> {
        create_mock_mint::handler(ctx)
    }

    /// Faucet: mint Mock USDC to a user's token account
    pub fn mint_mock_usdc(ctx: Context<MintMockUsdc>, amount: u64) -> Result<()> {
        mint_mock_usdc::handler(ctx, amount)
    }

    /// Initialize global protocol state (treasury and fee configuration)
    pub fn initialize_global_state(
        ctx: Context<InitializeGlobalState>,
        treasury_address: Pubkey,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        initialize_global_state::handler(ctx, treasury_address, protocol_fee_bps)
    }

    /// Deposit stake for an event (admin stakes collateral)
    pub fn stake_event(
        ctx: Context<StakeEvent>,
        event_id: String,
        stake_amount: u64,
    ) -> Result<()> {
        stake_event::handler(ctx, event_id, stake_amount)
    }

    /// Initialize a new event with USDC vault
    pub fn initialize_event(
        ctx: Context<InitializeEvent>,
        event_id: String,
        max_participants: u32,
        registration_fee: u64,
        start_time: i64,
        end_time: i64,
        dispute_lock_seconds: i64,
    ) -> Result<()> {
        initialize::handler(ctx, event_id, max_participants, registration_fee, start_time, end_time, dispute_lock_seconds)
    }

    /// Start a race (transition from Initialized to Active)
    pub fn start_race(
        ctx: Context<StartRace>,
        event_id: String,
    ) -> Result<()> {
        start_race::handler(ctx, event_id)
    }

    /// Complete a race (transition from Active to Completed)
    pub fn complete_race(
        ctx: Context<CompleteRace>,
        event_id: String,
    ) -> Result<()> {
        complete_race::handler(ctx, event_id)
    }

    /// Register a participant for an event (pays USDC fee)
    pub fn register_participant(
        ctx: Context<RegisterParticipant>,
        event_id: String,
        chip_uid: String,
        wallet_address: Pubkey,
        full_name: String,
        runner_id: String,
    ) -> Result<()> {
        register_participant::handler(ctx, event_id, chip_uid, wallet_address, full_name, runner_id)
    }

    /// Record checkpoint completion for a participant
    pub fn record_finish(
        ctx: Context<RecordFinish>,
        event_id: String,
        chip_uid: String,
        checkpoint_id: u8,
        finish_position: u8,
        timestamp: i64,
    ) -> Result<()> {
        record_finish::handler(ctx, event_id, chip_uid, checkpoint_id, finish_position, timestamp)
    }

    /// Process refunds and prize distribution (USDC) for completed event
    pub fn process_refunds<'info>(
        ctx: Context<'info, ProcessRefunds<'info>>,
        event_id: String,
        finishers: Vec<FinisherData>,
        non_finishers: Vec<String>,
        recipient_wallets: Vec<Pubkey>,
        amounts: Vec<u64>,
        is_final_batch: bool,
    ) -> Result<()> {
        process_refunds::handler(ctx, event_id, finishers, non_finishers, recipient_wallets, amounts, is_final_batch)
    }

    /// Delete an event and return remaining funds
    pub fn delete_event(
        ctx: Context<DeleteEvent>,
        event_id: String,
    ) -> Result<()> {
        delete_event::handler(ctx, event_id)
    }

    /// Close a participant PDA to reclaim rent
    pub fn close_participant(
        ctx: Context<CloseParticipant>,
        event_id: String,
        chip_uid: String,
    ) -> Result<()> {
        close_participant::handler(ctx, event_id, chip_uid)
    }

    /// Slash admin stake and refund participants (on event failure)
    pub fn slash_and_refund<'info>(
        ctx: Context<'info, SlashAndRefund<'info>>,
        event_id: String,
        participant_wallets: Vec<Pubkey>,
        refund_amounts: Vec<u64>,
        is_final_batch: bool,
    ) -> Result<()> {
        slash_and_refund::handler(ctx, event_id, participant_wallets, refund_amounts, is_final_batch)
    }

    /// Release admin's stake after dispute lock period
    pub fn release_stake(
        ctx: Context<ReleaseStake>,
        event_id: String,
    ) -> Result<()> {
        release_stake::handler(ctx, event_id)
    }
}
