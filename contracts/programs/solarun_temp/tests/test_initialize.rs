use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_keypair::Keypair,
    solana_transaction::versioned::VersionedTransaction,
    anchor_lang::solana_program::{pubkey::Pubkey, system_program},
    spl_token,
};

fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

#[test]
fn test_initialize() {
    let program_id = solarun_temp::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/solarun_temp.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    // 1. Create global mock mint
    let (mock_usdc_mint, _) = Pubkey::find_program_address(&[b"mock_usdc_mint"], &program_id);
    let (mint_authority, _) = Pubkey::find_program_address(&[b"mint_authority"], &program_id);

    let ix_create_mint = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::CreateMockMint {}.data(),
        solarun_temp::accounts::CreateMockMint {
            admin: payer.pubkey(),
            mock_usdc_mint,
            mint_authority,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );
    send_ix(&mut svm, &payer, ix_create_mint).expect("Failed to create mock mint");

    // 2. Initialize event
    let event_id = "test_event".to_string();
    let max_participants = 100;
    let registration_fee = 1_000_000;
    let start_time = 1700000000;
    let end_time = 1700003600;
    let dispute_lock_seconds = 3600;

    let (event_pda, _bump) = Pubkey::find_program_address(
        &[b"event", event_id.as_bytes()],
        &program_id,
    );
    let (vault_pda, _vault_bump) = Pubkey::find_program_address(
        &[b"vault", event_pda.as_ref()],
        &program_id,
    );

    let ix_init = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::InitializeEvent {
            event_id,
            max_participants,
            registration_fee,
            start_time,
            end_time,
            dispute_lock_seconds,
        }.data(),
        solarun_temp::accounts::InitializeEvent {
            admin: payer.pubkey(),
            event: event_pda,
            mock_usdc_mint,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );

    let res = send_ix(&mut svm, &payer, ix_init);
    assert!(res.is_ok(), "Initialize event failed: {:?}", res.unwrap_err());
}
