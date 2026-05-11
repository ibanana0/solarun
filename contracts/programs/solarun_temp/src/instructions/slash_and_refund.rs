use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::{Event, EventStatus, GlobalState};
use crate::error::ErrorCode;

/// Slash admin stake and refund participants (on event failure)
/// This is called when event fails/cancelled: returns participant deposits,
/// but slashes admin's stake and sends it to treasury as penalty
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct SlashAndRefund<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,

    /// Global state for treasury address
    #[account(
        seeds = [b"global"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// Event vault token account (holds all funds)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Treasury token account (receives slashed stake as penalty)
    #[account(
        mut,
        token::mint = vault.mint,
        token::authority = global_state.treasury_address
    )]
    pub treasury_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler<'info>(
    ctx: Context<'info, SlashAndRefund<'info>>,
    _event_id: String,
    _participant_wallets: Vec<Pubkey>,
    refund_amounts: Vec<u64>,
    is_final_batch: bool,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    // Verify event can be refunded
    require!(
        event.status == EventStatus::Completed || event.status == EventStatus::Initialized,
        ErrorCode::CannotRefundEventNotCompleted
    );
    require!(!event.is_completed, ErrorCode::RefundAlreadyProcessed);

    // Calculate total refund amount
    let total_refunds: u64 = refund_amounts.iter().try_fold(0u64, |acc, &x| {
        acc.checked_add(x)
    }).ok_or(ErrorCode::ArithmeticOverflow)?;

    // Slash: extract stake amount as penalty to treasury
    let slash_amount = event.stake_amount;

    // Verify vault has enough for refunds + slash
    let vault_balance = ctx.accounts.vault.amount;
    let total_needed = total_refunds.checked_add(slash_amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(vault_balance >= total_needed, ErrorCode::InsufficientVaultFunds);

    // Event PDA is vault authority
    let signer_seeds: &[&[u8]] = &[b"event", event.event_id.as_bytes(), &[event.bump]];
    let signer = &[signer_seeds];

    // 1. Send slashed stake to treasury
    if slash_amount > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.treasury_account.to_account_info(),
            authority: event.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        );
        anchor_spl::token::transfer(cpi_ctx, slash_amount)?;
    }

    // 2. Process refunds to participants via remaining_accounts
    let remaining_accounts = ctx.remaining_accounts;
    require!(remaining_accounts.len() == refund_amounts.len(), ErrorCode::InvalidFinisherPosition);

    for (i, recipient_ata) in remaining_accounts.iter().enumerate() {
        let amount = refund_amounts[i];
        if amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: recipient_ata.to_account_info(),
                authority: event.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                cpi_accounts,
                signer,
            );
            anchor_spl::token::transfer(cpi_ctx, amount)?;
        }
    }

    // Mark as completed to prevent re-entry
    if is_final_batch {
        event.is_completed = true;
        event.status = EventStatus::Settled;
    }

    emit!(SlashAndRefundProcessed {
        event_id: event.event_id.clone(),
        slash_amount,
        total_refunded: total_refunds,
        participants_refunded: refund_amounts.len() as u32,
    });

    msg!("Slash and refund processed: {} | slashed: {} | refunded: {}", 
        event.event_id, slash_amount, total_refunds);
    Ok(())
}

#[event]
pub struct SlashAndRefundProcessed {
    pub event_id: String,
    pub slash_amount: u64,
    pub total_refunded: u64,
    pub participants_refunded: u32,
}
