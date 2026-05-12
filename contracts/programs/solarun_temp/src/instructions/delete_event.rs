use crate::error::ErrorCode;
use crate::{Event, EventStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

/// Cancel and delete an event.
///
/// This instruction can ONLY be called when the event is in `Initialized` (Pending) status.
/// It refunds ALL registered participants their full registration fee (100%), then on the
/// final batch it returns the admin's stake and closes the vault + event accounts.
///
/// Flow:
///   1. Backend calls this once (or multiple times for large participant lists) with
///      `amounts` = each participant's registration fee and the corresponding ATAs in
///      `remaining_accounts`.
///   2. On the final batch, `is_final_batch = true`:
///      - Any leftover vault balance (admin's stake) is returned to admin's token account.
///      - The vault token account is closed (rent returned to admin).
///      - The event account lamports are transferred to admin (account zeroed).
///
/// NOTE: The contract does NOT enforce that every participant has been included —
///       the backend is responsible for passing all participants before setting
///       `is_final_batch = true`.
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct DeleteEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Event PDA — NOT auto-closed here; manually closed on the final batch.
    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,

    /// Vault token account that holds registration fees + admin stake.
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Admin's USDC token account — receives the stake return on final batch.
    #[account(
        mut,
        constraint = admin_token_account.owner == admin.key() @ ErrorCode::InvalidWalletAddress,
        constraint = admin_token_account.mint == event.mint @ ErrorCode::InvalidWalletFormat,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler<'info>(
    ctx: Context<'info, DeleteEvent<'info>>,
    event_id: String,
    amounts: Vec<u64>, // Refund amount for each participant in remaining_accounts
    is_final_batch: bool, // True = close accounts after this batch
) -> Result<()> {
    // ── Validation ──────────────────────────────────────────────────────────
    require!(
        ctx.accounts.event.event_id == event_id,
        ErrorCode::EventNotFound
    );

    // Only allow cancellation when event is still Pending (Initialized).
    // Events that are Active, Completed, or Settled cannot be deleted this way.
    require!(
        ctx.accounts.event.status == EventStatus::Initialized,
        ErrorCode::EventMustBePending
    );

    let remaining_accounts = ctx.remaining_accounts;
    require!(
        remaining_accounts.len() == amounts.len(),
        ErrorCode::InvalidFinisherPosition
    );

    // Calculate total refund for this batch and validate vault has enough.
    let total_refund: u64 = amounts
        .iter()
        .try_fold(0u64, |acc, &x| acc.checked_add(x))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let vault_balance = ctx.accounts.vault.amount;
    require!(
        vault_balance >= total_refund,
        ErrorCode::InsufficientVaultForRefunds
    );

    // ── Signer seeds (event PDA is vault authority) ──────────────────────────
    // Collect these before taking any mutable borrows.
    let event_id_bytes = ctx.accounts.event.event_id.as_bytes().to_vec();
    let event_bump = ctx.accounts.event.bump;
    let bump_arr = [event_bump];
    let signer_seeds: &[&[u8]] = &[b"event", &event_id_bytes, &bump_arr];
    let signer = &[signer_seeds];

    let token_program_key = ctx.accounts.token_program.key();

    // ── Refund participants ──────────────────────────────────────────────────
    for (i, recipient_ata) in remaining_accounts.iter().enumerate() {
        let amount = amounts[i];
        if amount > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: recipient_ata.to_account_info(),
                authority: ctx.accounts.event.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(token_program_key, cpi_accounts, signer);
            token::transfer(cpi_ctx, amount)?;
        }
    }

    // ── Final batch: return stake to admin and close accounts ────────────────
    if is_final_batch {
        // Remaining balance after participant refunds = admin's stake (+ any rounding).
        let remaining_after_refunds = vault_balance
            .checked_sub(total_refund)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Return admin's stake to their token account.
        if remaining_after_refunds > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.admin_token_account.to_account_info(),
                authority: ctx.accounts.event.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(token_program_key, cpi_accounts, signer);
            token::transfer(cpi_ctx, remaining_after_refunds)?;
        }

        // Close the vault SPL token account → rent goes to admin.
        let cpi_close = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.admin.to_account_info(),
            authority: ctx.accounts.event.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(token_program_key, cpi_close, signer);
        token::close_account(cpi_ctx)?;

        // Manually close the event account: zero lamports → admin, zero data.
        let event_info = ctx.accounts.event.to_account_info();
        let admin_info = ctx.accounts.admin.to_account_info();
        let event_lamports = event_info.lamports();

        **event_info.try_borrow_mut_lamports()? = 0;

        let admin_lamports = admin_info.lamports();
        **admin_info.try_borrow_mut_lamports()? = admin_lamports
            .checked_add(event_lamports)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Zero-out account data (sets discriminator to closed sentinel).
        let mut data = event_info.try_borrow_mut_data()?;
        for byte in data.iter_mut() {
            *byte = 0;
        }

        emit!(EventDeleted {
            event_id: event_id.clone(),
            admin: ctx.accounts.admin.key(),
            participants_refunded: amounts.len() as u32,
            stake_returned: remaining_after_refunds,
            is_final: true,
        });

        msg!("Event cancelled and deleted: {}", event_id);
    } else {
        emit!(EventDeleted {
            event_id: event_id.clone(),
            admin: ctx.accounts.admin.key(),
            participants_refunded: amounts.len() as u32,
            stake_returned: 0,
            is_final: false,
        });

        msg!(
            "Event cancellation batch processed ({} refunds): {}",
            amounts.len(),
            event_id
        );
    }

    Ok(())
}

#[event]
pub struct EventDeleted {
    pub event_id: String,
    pub admin: Pubkey,
    pub participants_refunded: u32,
    pub stake_returned: u64,
    pub is_final: bool,
}
