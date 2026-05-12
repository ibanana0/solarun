use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Process refunds and prize distribution (USDC) for completed event
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct ProcessRefunds<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,

    /// Vault token account holding deposited USDC.
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct FinisherData {
    pub rfid_uid: String,
    pub position: u8,
}

pub fn handler<'info>(
    ctx: Context<'info, ProcessRefunds<'info>>,
    event_id: String,
    _finishers: Vec<FinisherData>,
    _non_finishers: Vec<String>,
    _recipient_wallets: Vec<Pubkey>,
    amounts: Vec<u64>,
    is_final_batch: bool,
) -> Result<()> {
    // Read event data we need BEFORE taking mutable reference
    let event_id_str = ctx.accounts.event.event_id.clone();
    let event_bump = ctx.accounts.event.bump;
    let vault_balance = ctx.accounts.vault.amount;

    require!(event_id_str == event_id, ErrorCode::RefundEventNotFound);
    require!(ctx.accounts.event.status == EventStatus::Completed, ErrorCode::EventNotCompleted);

    // 1. Validasi total yang akan didistribusikan vs saldo vault
    // Menggunakan checked_add untuk mencegah overflow saat penjumlahan di Rust
    let total_to_distribute: u64 = amounts.iter().try_fold(0u64, |acc, &x| acc.checked_add(x))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Gunakan ErrorCode::VaultEmpty jika saldo tidak mencukupi (Lebih informatif daripada ArithmeticOverflow)
    require!(vault_balance >= total_to_distribute, ErrorCode::VaultEmpty);

    // 2. Validasi jumlah akun (remaining_accounts) harus sama dengan jumlah entry di amounts
    // Ini adalah penyebab utama error 6020 (ArithmeticOverflow di kode lama) jika .remainingAccounts() lupa dipanggil
    let remaining_accounts = ctx.remaining_accounts;
    require!(remaining_accounts.len() == amounts.len(), ErrorCode::InvalidFinisherPosition);

    // Event PDA is the vault token authority; sign with event seeds
    let signer_seeds: &[&[u8]] = &[b"event", event_id.as_bytes(), &[event_bump]];
    let signer = &[signer_seeds];

    let event_info = ctx.accounts.event.to_account_info();
    let vault_info = ctx.accounts.vault.to_account_info();
    let token_program_key = ctx.accounts.token_program.key();

    // 3. Eksekusi transfer ke masing-masing penerima (ATA)
    for (i, recipient_ata) in remaining_accounts.iter().enumerate() {
        let amount = amounts[i];
        if amount > 0 {
            let cpi_accounts = Transfer {
                from: vault_info.clone(),
                to: recipient_ata.to_account_info(),
                authority: event_info.clone(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                token_program_key,
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, amount)?;
        }
    }

    // Now take mutable reference for status update if final batch
    if is_final_batch {
        let event = &mut ctx.accounts.event;
        event.status = EventStatus::Settled;
    }

    emit!(RefundsProcessed {
        event_id: event_id.clone(),
        total_distributed: total_to_distribute,
        finisher_count: remaining_accounts.len() as u32,
        non_finisher_count: 0,
    });

    msg!("Refunds processed successfully for event: {}", event_id);
    Ok(())
}

#[event]
pub struct RefundsProcessed {
    pub event_id: String,
    pub total_distributed: u64,
    pub finisher_count: u32,
    pub non_finisher_count: u32,
}
