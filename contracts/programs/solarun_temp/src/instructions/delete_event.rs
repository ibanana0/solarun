use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount};
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Delete/close an event. Returns remaining USDC to admin and reclaims rent.
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct DeleteEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
        close = admin,
    )]
    pub event: Account<'info, Event>,

    /// Vault token account to be closed.
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Admin's USDC token account to receive remaining funds.
    #[account(
        mut,
        constraint = admin_token_account.owner == admin.key() @ ErrorCode::InvalidWalletAddress,
        constraint = admin_token_account.mint == event.mint @ ErrorCode::InvalidWalletFormat,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<DeleteEvent>, event_id: String) -> Result<()> {
    let event = &ctx.accounts.event;

    if event.event_id != event_id {
        return Err(ErrorCode::EventNotFound.into());
    }

    // Only allow deletion if event is Initialized or Settled
    if event.status != EventStatus::Initialized && event.status != EventStatus::Settled {
        return Err(ErrorCode::EventNotCompleted.into());
    }

    let event_id_bytes = event.event_id.as_bytes().to_vec();
    let event_bump = event.bump;
    let signer_seeds: &[&[u8]] = &[b"event", event_id_bytes.as_ref(), &[event_bump]];
    let signer = &[signer_seeds];

    // Transfer any remaining USDC from vault to admin
    let remaining = ctx.accounts.vault.amount;
    if remaining > 0 {
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
        token::transfer(cpi_ctx, remaining)?;
    }

    // Close the vault token account (returns rent to admin)
    let cpi_close = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.admin.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_close,
        signer,
    );
    token::close_account(cpi_ctx)?;

    // Event account is closed via `close = admin` in the Accounts struct

    emit!(EventDeleted {
        event_id: event_id.clone(),
        admin: ctx.accounts.admin.key(),
        remaining_returned: remaining,
    });

    msg!("Event deleted: {}", event_id);
    Ok(())
}

#[event]
pub struct EventDeleted {
    pub event_id: String,
    pub admin: Pubkey,
    pub remaining_returned: u64,
}
