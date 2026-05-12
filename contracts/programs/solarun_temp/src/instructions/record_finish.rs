use anchor_lang::prelude::*;
use crate::{Event, EventStatus, Participant, ParticipantStatus};
use crate::error::ErrorCode;

/// Record finish checkpoint for a participant
#[derive(Accounts)]
#[instruction(event_id: String, rfid_uid: String)]
pub struct RecordFinish<'info> {
    #[account(
        mut,
        constraint = backend.key() == event.admin @ ErrorCode::UnauthorizedBackend
    )]
    pub backend: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"participant", event.key().as_ref(), rfid_uid.as_bytes()],
        bump = participant.bump
    )]
    pub participant: Account<'info, Participant>,
}

pub fn handler(
    ctx: Context<RecordFinish>,
    event_id: String,
    rfid_uid: String,
    checkpoint_id: u8,
    finish_position: u8,
    timestamp: i64,
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
    if participant.rfid_uid != rfid_uid {
        return Err(ErrorCode::ParticipantNotFound.into());
    }

    // Record the precise IoT timestamp and checkpoint
    participant.last_checkpoint = checkpoint_id;
    participant.last_checkpoint_at = timestamp;

    match checkpoint_id {
        0 => {
            participant.status = ParticipantStatus::Running;
            msg!("Participant {} started at {}", rfid_uid, timestamp);
        }
        1 => {
            // Even though status is still "Running", the last_checkpoint will reflect CP1
            participant.status = ParticipantStatus::Running;
            msg!("Participant {} passed checkpoint 1 at {}", rfid_uid, timestamp);
        }
        2 => {
            if participant.status == ParticipantStatus::Finished {
                return Err(ErrorCode::ParticipantAlreadyFinished.into());
            }

            participant.status = ParticipantStatus::Finished;
            participant.finished_at = Some(timestamp);
            participant.finish_position = Some(finish_position);

            msg!("Participant {} finished at position {} at {}", rfid_uid, finish_position, timestamp);
        }
        _ => {
            return Err(ErrorCode::InvalidCheckpointId.into());
        }
    }

    emit!(CheckpointRecorded {
        event_id: event_id.clone(),
        rfid_uid: rfid_uid.clone(),
        checkpoint_id,
        timestamp,
    });

    Ok(())
}

#[event]
pub struct CheckpointRecorded {
    pub event_id: String,
    pub rfid_uid: String,
    pub checkpoint_id: u8,
    pub timestamp: i64,
}
