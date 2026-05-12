use crate::error::ErrorCode;
use crate::{Event, EventStatus, StakeVault};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer};

/// Stake deposit: Event organizer transfers tokens to StakeVault as collateral
/// This must be called before starting the event
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct StakeEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
        constraint = event.status == EventStatus::Initialized @ ErrorCode::EventAlreadyStarted,
    )]
    pub event: Account<'info, Event>,

    /// Stake vault account: holds admin's stake tokens
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 32 + 8 + 1 + 1,  // Discriminator + fields
        seeds = [b"stake_vault", event.key().as_ref()],
        bump
    )]
    pub stake_vault: Account<'info, StakeVault>,

    /// Admin's token account (ATA or custom) - source of stake
    #[account(
        mut,
        token::mint = mint,
        token::authority = admin
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    /// Vault token account for this event (receives stake)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<StakeEvent>, event_id: String, stake_amount: u64) -> Result<()> {
    require!(stake_amount > 0, ErrorCode::InsufficientStake);

    let event = &mut ctx.accounts.event;
    require!(event.stake_amount == 0, ErrorCode::StakeAlreadyDeposited);

    // Stake must be exactly 50% of the maximum possible prize pool
    // (registration_fee * max_participants * 50%) — enforced to prevent fraud
    let expected_max_pool = event
        .registration_fee
        .checked_mul(event.max_participants as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let required_stake = expected_max_pool
        .checked_mul(50)
        .and_then(|x| x.checked_div(100))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Allow stake >= required (at least 50% of max pool)
    require!(stake_amount >= required_stake, ErrorCode::StakeTooLow);

    msg!(
        "Stake validation: required={}, actual={}",
        required_stake,
        stake_amount
    );

    // Transfer tokens from admin to vault (as stake)
    let cpi_accounts = Transfer {
        from: ctx.accounts.admin_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.admin.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    anchor_spl::token::transfer(cpi_ctx, stake_amount)?;

    // Record stake in event account
    event.stake_amount = stake_amount;
    event.stake_vault = ctx.accounts.stake_vault.key();

    // Initialize StakeVault account
    let stake_vault = &mut ctx.accounts.stake_vault;
    stake_vault.event = event.key();
    stake_vault.admin = ctx.accounts.admin.key();
    stake_vault.vault = ctx.accounts.vault.key();
    stake_vault.amount = stake_amount;
    stake_vault.is_slashed = false;
    stake_vault.bump = ctx.bumps.stake_vault;

    emit!(StakeDeposited {
        event_id: event_id.clone(),
        admin: ctx.accounts.admin.key(),
        amount: stake_amount,
    });

    msg!(
        "Stake deposited: event={}, amount={}",
        event_id,
        stake_amount
    );
    Ok(())
}

#[event]
pub struct StakeDeposited {
    pub event_id: String,
    pub admin: Pubkey,
    pub amount: u64,
}
