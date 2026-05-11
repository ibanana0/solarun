use anchor_lang::prelude::*;
use crate::GlobalState;

/// Initialize global protocol state (treasury and fee configuration)
/// Only callable once - subsequent calls will fail due to init constraint
#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    #[account(
        init,
        payer = initializer,
        space = 8 + 32 + 2 + 1,  // 8 (discriminator) + 32 (Pubkey) + 2 (u16) + 1 (u8)
        seeds = [b"global"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeGlobalState>,
    treasury_address: Pubkey,
    protocol_fee_bps: u16,
) -> Result<()> {
    require!(protocol_fee_bps <= 10000, crate::error::ErrorCode::InvalidProtocolFee); // Max 100%

    let global_state = &mut ctx.accounts.global_state;
    global_state.treasury_address = treasury_address;
    global_state.protocol_fee_bps = protocol_fee_bps;
    global_state.bump = ctx.bumps.global_state;

    msg!("Global state initialized: treasury={}, fee_bps={}", treasury_address, protocol_fee_bps);
    Ok(())
}

#[event]
pub struct GlobalStateInitialized {
    pub treasury_address: Pubkey,
    pub protocol_fee_bps: u16,
}
