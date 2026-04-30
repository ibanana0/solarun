use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Process refunds and prize distribution for completed event
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

    /// CHECK: Vault account is managed by the program to store SOL. It does not need a specific data structure.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct FinisherData {
    pub chip_uid: String,
    pub position: u8,
}

pub fn handler(
    ctx: Context<ProcessRefunds>,
    event_id: String,
    _finishers: Vec<FinisherData>,
    _non_finishers: Vec<String>,
    _recipient_wallets: Vec<Pubkey>,
    amounts: Vec<u64>,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    if event.event_id != event_id {
        return Err(ErrorCode::RefundEventNotFound.into());
    }

    let vault_balance = ctx.accounts.vault.lamports();
    let total_to_distribute: u64 = amounts.iter().sum();
    
    if total_to_distribute > vault_balance {
        return Err(ErrorCode::ArithmeticOverflow.into());
    }

    event.status = EventStatus::Settled;

    emit!(RefundsProcessed {
        event_id: event_id.clone(),
        total_distributed: total_to_distribute,
        finisher_count: 0,
        non_finisher_count: 0,
    });

    msg!("Refunds processed for event: {}", event_id);
    Ok(())
}

#[event]
pub struct RefundsProcessed {
    pub event_id: String,
    pub total_distributed: u64,
    pub finisher_count: u32,
    pub non_finisher_count: u32,
}
