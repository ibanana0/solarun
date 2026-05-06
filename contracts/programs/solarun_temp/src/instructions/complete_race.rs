use anchor_lang::prelude::*;
use crate::{Event, EventStatus};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(event_id: String)]
pub struct CompleteRace<'info> {
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

pub fn handler(ctx: Context<CompleteRace>, _event_id: String) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(event.status == EventStatus::Active, ErrorCode::FinishEventNotActive);
    event.status = EventStatus::Completed;

    msg!("Race completed: {}", event.event_id);
    Ok(())
}
