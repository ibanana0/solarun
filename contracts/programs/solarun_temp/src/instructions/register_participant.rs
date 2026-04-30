use anchor_lang::prelude::*;
use crate::{Event, EventStatus, Participant, ParticipantStatus};
use crate::error::ErrorCode;

/// Register a participant for an event
#[derive(Accounts)]
#[instruction(event_id: String, chip_uid: String)]
pub struct RegisterParticipant<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        init,
        payer = admin,
        space = 8 + 400,
        seeds = [b"participant", event.key().as_ref(), chip_uid.as_bytes()],
        bump
    )]
    pub participant: Account<'info, Participant>,

    pub system_program: Program<'info, System>,
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

    if event.status != EventStatus::Active && event.status != EventStatus::Initialized {
        return Err(ErrorCode::EventNotActive.into());
    }

    if chip_uid.is_empty() || chip_uid.len() > 20 {
        return Err(ErrorCode::InvalidChipUid.into());
    }

    if wallet_address == Pubkey::default() {
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
    participant.registered_at = Clock::get()?.unix_timestamp;
    participant.finished_at = None;
    participant.bump = ctx.bumps.participant;

    event.participant_count = event.participant_count.checked_add(1)
        .ok_or(ErrorCode::MaxParticipantsReached)?;

    emit!(ParticipantRegistered {
        event_id: event_id.clone(),
        wallet: wallet_address,
        chip_uid: chip_uid.clone(),
    });

    msg!("Participant registered: {} for event: {}", chip_uid, event_id);
    Ok(())
}

#[event]
pub struct ParticipantRegistered {
    pub event_id: String,
    pub wallet: Pubkey,
    pub chip_uid: String,
}
