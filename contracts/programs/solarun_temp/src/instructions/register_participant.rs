use crate::error::ErrorCode;
use crate::{Event, EventStatus, Participant, ParticipantStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Register a participant for an event (pays USDC registration fee)
#[derive(Accounts)]
#[instruction(event_id: String, chip_uid: String)]
pub struct RegisterParticipant<'info> {
    #[account(mut)]
    pub runner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = runner.key() != event.admin @ ErrorCode::CreatorCannotRegister,
    )]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = runner,
        space = 8 + 400,
        seeds = [b"participant", event.key().as_ref(), chip_uid.as_bytes()],
        bump
    )]
    pub participant: Account<'info, Participant>,

    /// Runner's USDC token account (source of registration fee)
    #[account(
        mut,
        constraint = runner_token_account.owner == runner.key() @ ErrorCode::InvalidWalletAddress,
        constraint = runner_token_account.mint == event.mint @ ErrorCode::InvalidWalletFormat,
    )]
    pub runner_token_account: Account<'info, TokenAccount>,

    /// Vault token account (destination of registration fee)
    #[account(
        mut,
        seeds = [b"vault", event.key().as_ref()],
        bump = event.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<RegisterParticipant>,
    event_id: String,
    chip_uid: String,
    wallet_address: Pubkey,
    full_name: String,
    runner_id: String,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    if event.event_id != event_id {
        return Err(ErrorCode::EventNotFound.into());
    }

    require!(
        event.status == EventStatus::Initialized,
        ErrorCode::EventNotInitialized
    );
    require!(
        event.participant_count < event.max_participants,
        ErrorCode::MaxParticipantsReached
    );

    if chip_uid.is_empty() || chip_uid.len() > 20 {
        return Err(ErrorCode::InvalidChipUid.into());
    }

    if wallet_address == Pubkey::default() || wallet_address != ctx.accounts.runner.key() {
        return Err(ErrorCode::InvalidWalletAddress.into());
    }

    if full_name.is_empty() || full_name.len() > 50 {
        return Err(ErrorCode::InvalidFullName.into());
    }

    if runner_id.is_empty() || runner_id.len() > 36 {
        return Err(ErrorCode::InvalidRunnerId.into());
    }

    let participant = &mut ctx.accounts.participant;
    participant.runner_id = runner_id;
    participant.wallet = wallet_address;
    participant.chip_uid = chip_uid.clone();
    participant.full_name = full_name;
    participant.finish_position = None;
    participant.status = ParticipantStatus::Registered;
    participant.last_checkpoint = 0;
    participant.last_checkpoint_at = 0;
    participant.registered_at = Clock::get()?.unix_timestamp;
    participant.finished_at = None;
    participant.bump = ctx.bumps.participant;

    event.participant_count = event
        .participant_count
        .checked_add(1)
        .ok_or(ErrorCode::MaxParticipantsReached)?;

    // CPI: Transfer USDC registration fee from runner to vault
    let fee = event.registration_fee;
    if fee > 0 {
        let cpi_accounts = Transfer {
            from: ctx.accounts.runner_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.runner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
        token::transfer(cpi_ctx, fee)?;

        event.total_deposits = event
            .total_deposits
            .checked_add(fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }

    emit!(ParticipantRegistered {
        event_id: event_id.clone(),
        wallet: wallet_address,
        chip_uid: chip_uid.clone(),
        fee_paid: fee,
    });

    msg!(
        "Participant registered: {} for event: {}",
        chip_uid,
        event_id
    );
    Ok(())
}

#[event]
pub struct ParticipantRegistered {
    pub event_id: String,
    pub wallet: Pubkey,
    pub chip_uid: String,
    pub fee_paid: u64,
}
