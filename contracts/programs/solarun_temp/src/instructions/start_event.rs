use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

/// Start an event (transition from Initialized to Active)
#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct StartEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,
}

pub fn handler(
    ctx: Context<StartEvent>,
    event_id: String,
) -> Result<()> {
    let event = &mut ctx.accounts.event;

    if event.event_id != event_id {
        return Err(ErrorCode::EventNotFound.into());
    }

    if event.status != EventStatus::Initialized {
        return Err(ErrorCode::EventAlreadyStarted.into());
    }

    event.status = EventStatus::Active;
    event.start_time = Clock::get()?.unix_timestamp;

    emit!(EventStarted {
        event_id: event.event_id.clone(),
        admin: event.admin,
        start_time: event.start_time,
    });

    msg!("Event started: {}", event.event_id);
    Ok(())
}

#[event]
pub struct EventStarted {
    pub event_id: String,
    pub admin: Pubkey,
    pub start_time: i64,
}
