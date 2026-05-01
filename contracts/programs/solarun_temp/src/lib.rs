pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9E1BTHP1EP9UQbbXJKZ8Laj7PxXw1vhxJTeFpEEjfYZn");

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

    /// Initialize a new event with USDC vault
    pub fn initialize_event(
        ctx: Context<InitializeEvent>,
        event_id: String,
        vault_capacity: u64,
        registration_fee: u64,
        start_time: i64,
        end_time: i64,
    ) -> Result<()> {
        initialize::handler(ctx, event_id, vault_capacity, registration_fee, start_time, end_time)
    }

    /// Start an event (transition from Initialized to Active)
    pub fn start_event(
        ctx: Context<StartEvent>,
        event_id: String,
    ) -> Result<()> {
        start_event::handler(ctx, event_id)
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
        timestamp: i64,
    ) -> Result<()> {
        record_finish::handler(ctx, event_id, chip_uid, checkpoint_id, timestamp)
    }

    /// Process refunds and prize distribution (USDC) for completed event
    pub fn process_refunds<'info>(
        ctx: Context<'info, ProcessRefunds<'info>>,
        event_id: String,
        finishers: Vec<FinisherData>,
        non_finishers: Vec<String>,
        recipient_wallets: Vec<Pubkey>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        process_refunds::handler(ctx, event_id, finishers, non_finishers, recipient_wallets, amounts)
    }

    /// Delete an event and return remaining funds
    pub fn delete_event(
        ctx: Context<DeleteEvent>,
        event_id: String,
    ) -> Result<()> {
        delete_event::handler(ctx, event_id)
    }
}
