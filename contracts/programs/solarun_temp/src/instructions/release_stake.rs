use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Release admin's stake after dispute lock period
/// Only callable after 7 days have passed since event completion
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct ReleaseStake<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
        constraint = event.status == EventStatus::Completed @ ErrorCode::FinishEventNotActive,
    )]
    pub event: Account<'info, Event>,

    /// Event vault (source of stake return)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Admin's token account (destination)
    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = admin
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<ReleaseStake>,
    event_id: String,
) -> Result<()> {
    let event = &ctx.accounts.event;
    let current_time = Clock::get()?.unix_timestamp;

    // Check if dispute lock period has passed
    require!(
        current_time >= event.dispute_lock_until,
        ErrorCode::StakeLocked
    );

    let stake_amount = event.stake_amount;
    require!(stake_amount > 0, ErrorCode::NoStakeToRelease);

    // Event PDA is the vault authority
    let signer_seeds: &[&[u8]] = &[
        b"event",
        event_id.as_bytes(),
        &[event.bump],
    ];
    let signer = &[signer_seeds];

    // Transfer stake back to admin
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.admin_token_account.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer,
    );
    anchor_spl::token::transfer(cpi_ctx, stake_amount)?;

    // Clear stake amount to prevent double release
    let event_mut = &mut ctx.accounts.event;
    event_mut.stake_amount = 0;

    emit!(StakeReleased {
        event_id: event_id.clone(),
        admin: ctx.accounts.admin.key(),
        amount: stake_amount,
        released_at: current_time,
    });

    msg!("Stake released: event={}, amount={}", event_id, stake_amount);
    Ok(())
}

#[event]
pub struct StakeReleased {
    pub event_id: String,
    pub admin: Pubkey,
    pub amount: u64,
    pub released_at: i64,
}
