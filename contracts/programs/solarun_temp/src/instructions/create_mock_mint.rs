use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

/// One-time instruction to create the global Mock USDC mint.
/// The mint authority is a PDA so the program can mint freely for testing.
#[derive(Accounts)]
pub struct CreateMockMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"mock_usdc_mint"],
        bump,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub mock_usdc_mint: Account<'info, Mint>,

    /// CHECK: PDA used as mint authority. Seeds: ["mint_authority"].
    #[account(
        seeds = [b"mint_authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CreateMockMint>) -> Result<()> {
    msg!("Mock USDC mint created: {}", ctx.accounts.mock_usdc_mint.key());
    Ok(())
}
