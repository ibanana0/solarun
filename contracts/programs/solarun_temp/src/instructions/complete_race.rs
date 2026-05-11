use crate::error::ErrorCode;
use crate::{Event, EventStatus, GlobalState};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

/// Complete race and distribute treasury fees + return admin stake
/// This also performs fee distribution: takes treasury cut, returns stake to admin
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct CompleteRace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,

    /// Global state for treasury address and fee configuration
    #[account(
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// Event vault token account (holds registration deposits + stake)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Treasury token account (ATA of treasury_address) - receives protocol fee
    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = global_state.treasury_address
    )]
    pub treasury_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CompleteRace>, _event_id: String) -> Result<()> {
    // Read immutable data BEFORE taking a mutable reference to the event account.
    // This is required by the Rust borrow checker: once we take &mut, we cannot
    // call .to_account_info() (which requires &self).
    let event_id_bytes = ctx.accounts.event.event_id.clone();
    let event_bump = ctx.accounts.event.bump;
    require!(
        !ctx.accounts.event.is_completed,
        ErrorCode::EventAlreadyCompleted
    );
    require!(
        ctx.accounts.event.status == EventStatus::Active,
        ErrorCode::FinishEventNotActive
    );

    // Calculate fee amount from the event vault total.
    // ONLY the protocol fee is taken here; the remaining prize pool stays in the
    // vault so that process_refunds() can distribute it to winners.
    let vault_balance = ctx.accounts.vault.amount;
    let fee_bps = ctx.accounts.global_state.protocol_fee_bps as u64;
    let fee_amount = vault_balance
        .checked_mul(fee_bps)
        .and_then(|x| x.checked_div(10000))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let prize_pool_remaining = vault_balance
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Event PDA is the vault authority; sign with event seeds.
    // Use the pre-read event_id_bytes so we don't need to re-borrow event.
    let signer_seeds: &[&[u8]] = &[b"event", event_id_bytes.as_bytes(), &[event_bump]];
    let signer = &[signer_seeds];

    let event_info = ctx.accounts.event.to_account_info();

    // 1. Transfer ONLY the protocol fee to treasury.
    //    The prize pool (prize_pool_remaining) stays in the vault for process_refunds().
    if fee_amount > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.treasury_account.to_account_info(),
            authority: event_info,
        };
        let cpi_ctx =
            CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, fee_amount)?;
    }

    // Mark event as completed and update status.
    // DO NOT drain the remaining vault here — process_refunds() will handle it.
    let event = &mut ctx.accounts.event;
    
    // Set dispute lock period based on event configuration
    let current_time = Clock::get()?.unix_timestamp;
    event.dispute_lock_until = current_time + event.dispute_lock_seconds as i64;

    event.is_completed = true;
    event.status = EventStatus::Completed;

    emit!(RaceCompleted {
        event_id: event.event_id.clone(),
        vault_balance,
        fee_amount,
        prize_pool_remaining,
        dispute_lock_until: event.dispute_lock_until,
    });

    msg!(
        "Race completed: {} | vault: {} | fee: {} | prize_pool_remaining: {}",
        event.event_id,
        vault_balance,
        fee_amount,
        prize_pool_remaining
    );
    Ok(())
}

#[event]
pub struct RaceCompleted {
    pub event_id: String,
    pub vault_balance: u64,
    pub fee_amount: u64,
    pub prize_pool_remaining: u64,
    pub dispute_lock_until: i64,
}
