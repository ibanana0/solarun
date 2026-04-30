use anchor_lang::prelude::*;

use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Initialize a new event with vault
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct InitializeEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + 350,
        seeds = [b"event", event_id.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,

    /// CHECK: Vault account is managed by the program to store SOL. It does not need a specific data structure.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeEvent>,
    event_id: String,
    _vault_capacity: u64,
    _registration_fee: u64,
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
    event.status = EventStatus::Initialized;
    event.participant_count = 0;
    event.total_deposits = 0;
    event.start_time = start_time;
    event.end_time = end_time;
    event.bump = ctx.bumps.event;

    emit!(EventInitialized {
        event_id: event.event_id.clone(),
        admin: event.admin,
        vault: event.vault,
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
    pub start_time: i64,
    pub end_time: i64,
}
