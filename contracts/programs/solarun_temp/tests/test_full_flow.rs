use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_keypair::Keypair,
    solana_transaction::versioned::VersionedTransaction,
    anchor_lang::solana_program::{pubkey::Pubkey, system_program},
    spl_token,
    spl_associated_token_account,
};

fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<(), String> {
    send_ixs(svm, payer, &[ix])
}

fn send_ixs(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction]) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

fn get_ata(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    spl_associated_token_account::get_associated_token_address(wallet, mint)
}

fn setup() -> (LiteSVM, Keypair, Pubkey) {
    let program_id = solarun_temp::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/solarun_temp.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 50_000_000_000).unwrap();
    (svm, payer, program_id)
}

fn create_mock_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &Pubkey,
) -> (Pubkey, Pubkey) {
    let (mock_usdc_mint, _) = Pubkey::find_program_address(&[b"mock_usdc_mint"], program_id);
    let (mint_authority, _) = Pubkey::find_program_address(&[b"mint_authority"], program_id);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::CreateMockMint {}.data(),
        solarun_temp::accounts::CreateMockMint {
            admin: payer.pubkey(),
            mock_usdc_mint,
            mint_authority,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );
    send_ix(svm, payer, ix).unwrap();
    (mock_usdc_mint, mint_authority)
}

fn initialize_event(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    mock_usdc_mint: Pubkey,
) -> (Pubkey, Pubkey) {
    let (event_pda, _) = Pubkey::find_program_address(&[b"event", event_id.as_bytes()], program_id);
    let (vault_pda, _) = Pubkey::find_program_address(&[b"vault", event_pda.as_ref()], program_id);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::InitializeEvent {
            event_id: event_id.to_string(),
            max_participants: 100,
            registration_fee: 1_000_000,
            start_time: 1700000000,
            end_time: 1700003600,
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

    send_ix(svm, payer, ix).unwrap();
    (event_pda, vault_pda)
}

fn mint_usdc_to(
    svm: &mut LiteSVM,
    payer: &Keypair, // pays for tx and is the 'user'
    program_id: &Pubkey,
    mock_usdc_mint: Pubkey,
    mint_authority: Pubkey,
    amount: u64,
) -> Pubkey {
    let user_token_account = get_ata(&payer.pubkey(), &mock_usdc_mint);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::MintMockUsdc { amount }.data(),
        solarun_temp::accounts::MintMockUsdc {
            user: payer.pubkey(),
            mock_usdc_mint,
            mint_authority,
            user_token_account,
            system_program: system_program::id(),
            token_program: spl_token::id(),
            associated_token_program: spl_associated_token_account::id(),
        }.to_account_metas(None),
    );

    send_ix(svm, payer, ix).unwrap();
    user_token_account
}

fn register_participant(
    svm: &mut LiteSVM,
    runner: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
    vault_pda: Pubkey,
    mock_usdc_mint: Pubkey,
    chip_uid: &str,
) {
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), chip_uid.as_bytes()],
        program_id,
    );
    let runner_token_account = get_ata(&runner.pubkey(), &mock_usdc_mint);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: event_id.to_string(),
            chip_uid: chip_uid.to_string(),
            wallet_address: runner.pubkey(),
            full_name: "Test Runner".to_string(),
            runner_id: format!("run_{}", chip_uid),
        }.data(),
        solarun_temp::accounts::RegisterParticipant {
            runner: runner.pubkey(),
            event: event_pda,
            participant: participant_pda,
            runner_token_account,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );

    send_ix(svm, runner, ix).unwrap();
}

fn start_race(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
) {
    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::StartRace {
            event_id: event_id.to_string(),
        }.data(),
        solarun_temp::accounts::StartRace {
            admin: payer.pubkey(),
            event: event_pda,
        }.to_account_metas(None),
    );
    send_ix(svm, payer, ix).unwrap();
}

fn record_finish(
    svm: &mut LiteSVM,
    admin: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
    chip_uid: &str,
    position: u8,
) {
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), chip_uid.as_bytes()],
        program_id,
    );

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::RecordFinish {
            event_id: event_id.to_string(),
            chip_uid: chip_uid.to_string(),
            checkpoint_id: 2, // finish
            finish_position: position,
            timestamp: 1700001000 + (position as i64 * 100),
        }.data(),
        solarun_temp::accounts::RecordFinish {
            backend: admin.pubkey(),
            event: event_pda,
            participant: participant_pda,
        }.to_account_metas(None),
    );
    send_ix(svm, admin, ix).unwrap();
}

fn complete_race(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
) {
    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::CompleteRace {
            event_id: event_id.to_string(),
        }.data(),
        solarun_temp::accounts::CompleteRace {
            admin: payer.pubkey(),
            event: event_pda,
        }.to_account_metas(None),
    );
    send_ix(svm, payer, ix).unwrap();
}

#[test]
fn test_full_e2e_flow() {
    let (mut svm, admin, program_id) = setup();
    let event_id = "evt_e2e_1";

    let (mock_usdc_mint, mint_authority) = create_mock_mint(&mut svm, &admin, &program_id);
    let (event_pda, vault_pda) = initialize_event(&mut svm, &admin, &program_id, event_id, mock_usdc_mint);

    // Create 3 runners
    let mut runners = vec![];
    for i in 0..3 {
        let runner = Keypair::new();
        svm.airdrop(&runner.pubkey(), 1_000_000_000).unwrap();
        mint_usdc_to(&mut svm, &runner, &program_id, mock_usdc_mint, mint_authority, 5_000_000);
        
        let chip_uid = format!("chip_00{}", i);
        register_participant(&mut svm, &runner, &program_id, event_id, event_pda, vault_pda, mock_usdc_mint, &chip_uid);
        runners.push((runner, chip_uid));
    }

    start_race(&mut svm, &admin, &program_id, event_id, event_pda);

    // Verify registration fails after race starts
    let late_runner = Keypair::new();
    svm.airdrop(&late_runner.pubkey(), 1_000_000_000).unwrap();
    mint_usdc_to(&mut svm, &late_runner, &program_id, mock_usdc_mint, mint_authority, 5_000_000);
    let late_chip_uid = "chip_late";
    
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), late_chip_uid.as_bytes()],
        &program_id,
    );
    let runner_token_account = get_ata(&late_runner.pubkey(), &mock_usdc_mint);

    let ix_late_reg = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: event_id.to_string(),
            chip_uid: late_chip_uid.to_string(),
            wallet_address: late_runner.pubkey(),
            full_name: "Late Runner".to_string(),
            runner_id: "run_late".to_string(),
        }.data(),
        solarun_temp::accounts::RegisterParticipant {
            runner: late_runner.pubkey(),
            event: event_pda,
            participant: participant_pda,
            runner_token_account,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );

    let res = send_ix(&mut svm, &late_runner, ix_late_reg);
    assert!(res.is_err(), "Registration should fail after race starts");

    // Record finish for runners 0 and 1
    record_finish(&mut svm, &admin, &program_id, event_id, event_pda, &runners[0].1, 1);
    record_finish(&mut svm, &admin, &program_id, event_id, event_pda, &runners[1].1, 2);

    complete_race(&mut svm, &admin, &program_id, event_id, event_pda);

    // Process refunds
    let mut metas = solarun_temp::accounts::ProcessRefunds {
        admin: admin.pubkey(),
        event: event_pda,
        vault: vault_pda,
        token_program: spl_token::id(),
    }.to_account_metas(None);

    // Add remaining accounts for the 2 winners
    let ata_1 = get_ata(&runners[0].0.pubkey(), &mock_usdc_mint);
    let ata_2 = get_ata(&runners[1].0.pubkey(), &mock_usdc_mint);
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(ata_1, false));
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(ata_2, false));

    let finishers = vec![
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: runners[0].1.clone(), position: 1 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: runners[1].1.clone(), position: 2 },
    ];
    let amounts = vec![2_000_000, 1_000_000]; // Total 3M, vault has 3M (from 3 runners * 1M fee)

    let ix_refund = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::ProcessRefunds {
            event_id: event_id.to_string(),
            finishers,
            non_finishers: vec![runners[2].1.clone()],
            recipient_wallets: vec![runners[0].0.pubkey(), runners[1].0.pubkey()],
            amounts,
            is_final_batch: true,
        }.data(),
        metas,
    );

    send_ix(&mut svm, &admin, ix_refund).expect("Process refunds failed");

    // Delete event
    mint_usdc_to(&mut svm, &admin, &program_id, mock_usdc_mint, mint_authority, 0); // initialize admin ATA
    let admin_token_account = get_ata(&admin.pubkey(), &mock_usdc_mint);
    
    let ix_delete = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::DeleteEvent {
            event_id: event_id.to_string(),
        }.data(),
        solarun_temp::accounts::DeleteEvent {
            admin: admin.pubkey(),
            event: event_pda,
            vault: vault_pda,
            admin_token_account,
            token_program: spl_token::id(),
        }.to_account_metas(None),
    );

    send_ix(&mut svm, &admin, ix_delete).expect("Delete event failed");
}
