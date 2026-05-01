use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Initialize a new event with a USDC vault token account
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct InitializeEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + 400,
        seeds = [b"event", event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,

    /// The Mock USDC mint (must already exist via create_mock_mint).
    pub mock_usdc_mint: Account<'info, Mint>,

    /// Vault token account: holds USDC deposits for this event.
    /// Authority is the event PDA so the program can transfer out via PDA signing.
    #[account(
        init,
        payer = admin,
        seeds = [b"vault", event.key().as_ref()],
        bump,
        token::mint = mock_usdc_mint,
        token::authority = event,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<InitializeEvent>,
    event_id: String,
    _vault_capacity: u64,
    registration_fee: u64,
    start_time: i64,
    end_time: i64,
) -> Result<()> {
    // Validate event_id
    if event_id.is_empty() || event_id.len() > 36 {
        return Err(ErrorCode::InvalidEventId.into());
    }

    // Validate times
    if end_time <= start_time {
        return Err(ErrorCode::EndTimeInvalid.into());
    }

    // Create event account
    let event = &mut ctx.accounts.event;
    event.event_id = event_id.clone();
    event.vault = ctx.accounts.vault.key();
    event.admin = ctx.accounts.admin.key();
    event.mint = ctx.accounts.mock_usdc_mint.key();
    event.status = EventStatus::Initialized;
    event.participant_count = 0;
    event.total_deposits = 0;
    event.registration_fee = registration_fee;
    event.start_time = start_time;
    event.end_time = end_time;
    event.bump = ctx.bumps.event;
    event.vault_bump = ctx.bumps.vault;

    emit!(EventInitialized {
        event_id: event.event_id.clone(),
        admin: event.admin,
        vault: event.vault,
        mint: event.mint,
        start_time,
        end_time,
    });

    msg!("Event initialized: {}", event.event_id);
    Ok(())
}

#[event]
pub struct EventInitialized {
    pub event_id: String,
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub mint: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
}
