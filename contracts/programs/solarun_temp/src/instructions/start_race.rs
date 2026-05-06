use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct StartRace<'info> {
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

pub fn handler(ctx: Context<StartRace>, _event_id: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(event.status == EventStatus::Initialized, ErrorCode::EventAlreadyStarted);
    event.status = EventStatus::Active;
    
    msg!("Race started: {}", event.event_id);
    Ok(())
}
