use anchor_lang::prelude::*;
use crate::{Event, Participant};
use crate::error::ErrorCode;

/// Close a participant PDA to reclaim rent.
#[derive(Accounts)]
#[instruction(event_id: String, rfid_uid: String)]
pub struct CloseParticipant<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"event", event_id.as_bytes()],
        bump = event.bump,
        constraint = event.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub event: Account<'info, Event>,

    #[account(
        mut,
        seeds = [b"participant", event.key().as_ref(), rfid_uid.as_bytes()],
        bump = participant.bump,
        close = admin,
    )]
    pub participant: Account<'info, Participant>,
}

pub fn handler(_ctx: Context<CloseParticipant>, _event_id: String, rfid_uid: String) -> Result<()> {
    // The account is closed and rent is returned to the admin via `close = admin`.
    msg!("Participant PDA closed, rent returned to admin for chip: {}", rfid_uid);
    Ok(())
}
