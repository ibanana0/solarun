use anchor_lang::prelude::*;
use crate::{Event, EventStatus, Participant, ParticipantStatus};
use crate::error::ErrorCode;

/// Record finish checkpoint for a participant
#[derive(Accounts)]
#[instruction(event_id: String, chip_uid: String)]
pub struct RecordFinish<'info> {
    #[account(mut)]
    pub backend: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"participant", event.key().as_ref(), chip_uid.as_bytes()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,
}

pub fn handler(
    ctx: Context<RecordFinish>,
    event_id: String,
    chip_uid: String,
    checkpoint_id: u8,
    _timestamp: i64,
) -> Result<()> {
    let event = &ctx.accounts.event;

    if event.event_id != event_id {
        return Err(ErrorCode::FinishEventNotFound.into());
    }

    if event.status != EventStatus::Active {
        return Err(ErrorCode::FinishEventNotActive.into());
    }

    if checkpoint_id > 2 {
        return Err(ErrorCode::InvalidCheckpointId.into());
    }

    let participant = &mut ctx.accounts.participant;
    if participant.chip_uid != chip_uid {
        return Err(ErrorCode::ParticipantNotFound.into());
    }

    match checkpoint_id {
        0 => {
            participant.status = ParticipantStatus::Running;
            msg!("Participant {} started", chip_uid);
        }
        1 => {
            msg!("Participant {} passed checkpoint 1", chip_uid);
        }
        2 => {
            if participant.status == ParticipantStatus::Finished {
                return Err(ErrorCode::ParticipantAlreadyFinished.into());
            }

            participant.status = ParticipantStatus::Finished;
            participant.finished_at = Some(Clock::get()?.unix_timestamp);

            if participant.finish_position.is_none() {
                participant.finish_position = Some(1);
            }

            msg!("Participant {} finished", chip_uid);
        }
        _ => {
            return Err(ErrorCode::InvalidCheckpointId.into());
        }
    }

    emit!(CheckpointRecorded {
        event_id: event_id.clone(),
        chip_uid: chip_uid.clone(),
        checkpoint_id,
    });

    Ok(())
}

#[event]
pub struct CheckpointRecorded {
    pub event_id: String,
    pub chip_uid: String,
    pub checkpoint_id: u8,
}
