use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Mint, MintTo, Token, TokenAccount},
    associated_token::AssociatedToken,
};

/// Faucet: mint 1000 Mock USDC to the caller's ATA.
#[derive(Accounts)]
pub struct MintMockUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"mock_usdc_mint"],
        bump,
    )]
    pub mock_usdc_mint: Account<'info, Mint>,

    /// CHECK: PDA mint authority. Seeds: ["mint_authority"].
    #[account(
        seeds = [b"mint_authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mock_usdc_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<MintMockUsdc>, amount: u64) -> Result<()> {
    let bump = ctx.bumps.mint_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"mint_authority", &[bump]]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.mock_usdc_mint.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.mint_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::mint_to(cpi_ctx, amount)?;

    msg!("Faucet: minted {} Mock USDC to {}", amount, ctx.accounts.user.key());
    Ok(())
}
