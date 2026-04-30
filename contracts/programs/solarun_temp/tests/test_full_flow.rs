use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_keypair::Keypair,
    solana_transaction::versioned::VersionedTransaction,
};

/// Helper: build, sign, and send a single instruction
fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

/// Helper: derive event PDA
fn event_pda(program_id: &anchor_lang::solana_program::pubkey::Pubkey, event_id: &str) -> (anchor_lang::solana_program::pubkey::Pubkey, u8) {
    anchor_lang::solana_program::pubkey::Pubkey::find_program_address(
        &[b"event", event_id.as_bytes()],
        program_id,
    )
}

/// Helper: derive participant PDA
fn participant_pda(
    program_id: &anchor_lang::solana_program::pubkey::Pubkey,
    event_pda: &anchor_lang::solana_program::pubkey::Pubkey,
    chip_uid: &str,
) -> (anchor_lang::solana_program::pubkey::Pubkey, u8) {
    anchor_lang::solana_program::pubkey::Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), chip_uid.as_bytes()],
        program_id,
    )
}

/// Setup: creates an SVM instance with program loaded and payer funded
fn setup() -> (LiteSVM, Keypair, anchor_lang::solana_program::pubkey::Pubkey) {
    let program_id = solarun_temp::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/solarun_temp.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 50_000_000_000).unwrap(); // 50 SOL
    (svm, payer, program_id)
}

/// Helper: initialize an event and return event_pda + vault pubkey
fn initialize_event(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &anchor_lang::solana_program::pubkey::Pubkey,
    event_id: &str,
) -> (anchor_lang::solana_program::pubkey::Pubkey, anchor_lang::solana_program::pubkey::Pubkey) {
    let (event_pda, _) = event_pda(program_id, event_id);
    let vault = Keypair::new();

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::InitializeEvent {
            event_id: event_id.to_string(),
            vault_capacity: 100_000_000,
            registration_fee: 1_000_000,
            start_time: 1700000000,
            end_time: 1700003600,
        }.data(),
        solarun_temp::accounts::InitializeEvent {
            admin: payer.pubkey(),
            event: event_pda,
            vault: vault.pubkey(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );

    send_ix(svm, payer, ix).expect("Initialize event failed");
    (event_pda, vault.pubkey())
}

/// Helper: start an event
fn start_event(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &anchor_lang::solana_program::pubkey::Pubkey,
    event_id: &str,
    event_pda: &anchor_lang::solana_program::pubkey::Pubkey,
) {
    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::StartEvent {
            event_id: event_id.to_string(),
        }.data(),
        solarun_temp::accounts::StartEvent {
            admin: payer.pubkey(),
            event: *event_pda,
        }.to_account_metas(None),
    );
    send_ix(svm, payer, ix).expect("Start event failed");
}

/// Helper: register a participant
fn register_participant(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &anchor_lang::solana_program::pubkey::Pubkey,
    event_id: &str,
    event_pda: &anchor_lang::solana_program::pubkey::Pubkey,
    chip_uid: &str,
    wallet: &anchor_lang::solana_program::pubkey::Pubkey,
    full_name: &str,
    runner_id: &str,
) -> anchor_lang::solana_program::pubkey::Pubkey {
    let (part_pda, _) = participant_pda(program_id, event_pda, chip_uid);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: event_id.to_string(),
            chip_uid: chip_uid.to_string(),
            wallet_address: *wallet,
            full_name: full_name.to_string(),
            runner_id: runner_id.to_string(),
        }.data(),
        solarun_temp::accounts::RegisterParticipant {
            admin: payer.pubkey(),
            event: *event_pda,
            participant: part_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );

    send_ix(svm, payer, ix).expect(&format!("Register participant {} failed", chip_uid));
    part_pda
}

// =============================================================================
// TEST 1: Initialize Event
// =============================================================================

#[test]
fn test_initialize_event() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_init_1");

    // Verify event PDA account exists (has lamports)
    let account = svm.get_account(&event_pda);
    assert!(account.is_some(), "Event account should exist after initialization");
}

// =============================================================================
// TEST 2: Start Event
// =============================================================================

#[test]
fn test_start_event() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_start_1");

    // Start the event
    start_event(&mut svm, &payer, &program_id, "evt_start_1", &event_pda);

    // Verify event account still exists
    let account = svm.get_account(&event_pda);
    assert!(account.is_some(), "Event account should exist after start");
}

#[test]
fn test_start_event_twice_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_start_2");

    // Start event first time — should succeed
    start_event(&mut svm, &payer, &program_id, "evt_start_2", &event_pda);

    // Start event second time — should fail
    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::StartEvent {
            event_id: "evt_start_2".to_string(),
        }.data(),
        solarun_temp::accounts::StartEvent {
            admin: payer.pubkey(),
            event: event_pda,
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &payer, ix);
    assert!(res.is_err(), "Starting an already-active event should fail");
}

#[test]
fn test_start_event_unauthorized_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_start_3");

    // Try to start with a different (unauthorized) signer
    let unauthorized = Keypair::new();
    svm.airdrop(&unauthorized.pubkey(), 1_000_000_000).unwrap();

    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::StartEvent {
            event_id: "evt_start_3".to_string(),
        }.data(),
        solarun_temp::accounts::StartEvent {
            admin: unauthorized.pubkey(),
            event: event_pda,
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &unauthorized, ix);
    assert!(res.is_err(), "Unauthorized signer should not be able to start event");
}

// =============================================================================
// TEST 3: Register Participants
// =============================================================================

#[test]
fn test_register_5_participants() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_reg_1");

    for i in 1..=5 {
        let wallet = Keypair::new();
        let part_pda = register_participant(
            &mut svm, &payer, &program_id,
            "evt_reg_1", &event_pda,
            &format!("CHIP_{}", i),
            &wallet.pubkey(),
            &format!("Runner {}", i),
            &format!("RUN_{}", i),
        );

        // Assert participant PDA account was created
        let account = svm.get_account(&part_pda);
        assert!(account.is_some(), "Participant {} account should exist", i);
    }
}

#[test]
fn test_duplicate_registration_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_reg_2");

    let wallet = Keypair::new();

    // First registration — should succeed
    register_participant(
        &mut svm, &payer, &program_id,
        "evt_reg_2", &event_pda,
        "CHIP_DUP", &wallet.pubkey(), "Runner Dup", "RUN_DUP",
    );

    // Second registration with same chip_uid — should fail (PDA already initialized)
    let (part_pda, _) = participant_pda(&program_id, &event_pda, "CHIP_DUP");
    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: "evt_reg_2".to_string(),
            chip_uid: "CHIP_DUP".to_string(),
            wallet_address: wallet.pubkey(),
            full_name: "Duplicate".to_string(),
            runner_id: "DUP_2".to_string(),
        }.data(),
        solarun_temp::accounts::RegisterParticipant {
            admin: payer.pubkey(),
            event: event_pda,
            participant: part_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &payer, ix);
    assert!(res.is_err(), "Duplicate registration should fail");
}

// =============================================================================
// TEST 4: Record Finish
// =============================================================================

#[test]
fn test_record_finish_for_4_participants() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_fin_1");

    // Register 5 participants
    let mut part_pdas = vec![];
    for i in 1..=5 {
        let wallet = Keypair::new();
        let pda = register_participant(
            &mut svm, &payer, &program_id,
            "evt_fin_1", &event_pda,
            &format!("CHIP_{}", i),
            &wallet.pubkey(),
            &format!("Runner {}", i),
            &format!("RUN_{}", i),
        );
        part_pdas.push(pda);
    }

    // Start the event (Initialized → Active)
    start_event(&mut svm, &payer, &program_id, "evt_fin_1", &event_pda);

    // Record finish for first 4 participants (checkpoint_id = 2 = Finish)
    for i in 0..4 {
        let chip_uid = format!("CHIP_{}", i + 1);
        let ix = Instruction::new_with_bytes(
            program_id,
            &solarun_temp::instruction::RecordFinish {
                event_id: "evt_fin_1".to_string(),
                chip_uid: chip_uid.clone(),
                checkpoint_id: 2,
                timestamp: 1700003000 + (i as i64 * 10),
            }.data(),
            solarun_temp::accounts::RecordFinish {
                backend: payer.pubkey(),
                event: event_pda,
                participant: part_pdas[i],
            }.to_account_metas(None),
        );
        send_ix(&mut svm, &payer, ix)
            .expect(&format!("Record finish for participant {} failed", i + 1));
    }
}

#[test]
fn test_record_finish_without_start_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_fin_2");

    let wallet = Keypair::new();
    let part_pda = register_participant(
        &mut svm, &payer, &program_id,
        "evt_fin_2", &event_pda,
        "CHIP_NS", &wallet.pubkey(), "No Start", "RUN_NS",
    );

    // Try to record finish WITHOUT calling start_event first
    // Event is still in Initialized status → should fail
    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RecordFinish {
            event_id: "evt_fin_2".to_string(),
            chip_uid: "CHIP_NS".to_string(),
            checkpoint_id: 2,
            timestamp: 1700003000,
        }.data(),
        solarun_temp::accounts::RecordFinish {
            backend: payer.pubkey(),
            event: event_pda,
            participant: part_pda,
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &payer, ix);
    assert!(res.is_err(), "Record finish should fail when event is not Active");
}

#[test]
fn test_record_finish_duplicate_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, _vault) = initialize_event(&mut svm, &payer, &program_id, "evt_fin_3");

    let wallet = Keypair::new();
    let part_pda = register_participant(
        &mut svm, &payer, &program_id,
        "evt_fin_3", &event_pda,
        "CHIP_DF", &wallet.pubkey(), "Dup Finish", "RUN_DF",
    );

    start_event(&mut svm, &payer, &program_id, "evt_fin_3", &event_pda);

    // First finish — should succeed
    let ix1 = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RecordFinish {
            event_id: "evt_fin_3".to_string(),
            chip_uid: "CHIP_DF".to_string(),
            checkpoint_id: 2,
            timestamp: 1700003000,
        }.data(),
        solarun_temp::accounts::RecordFinish {
            backend: payer.pubkey(),
            event: event_pda,
            participant: part_pda,
        }.to_account_metas(None),
    );
    send_ix(&mut svm, &payer, ix1).expect("First finish should succeed");

    // Second finish — should fail (already finished)
    let ix2 = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RecordFinish {
            event_id: "evt_fin_3".to_string(),
            chip_uid: "CHIP_DF".to_string(),
            checkpoint_id: 2,
            timestamp: 1700003010,
        }.data(),
        solarun_temp::accounts::RecordFinish {
            backend: payer.pubkey(),
            event: event_pda,
            participant: part_pda,
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &payer, ix2);
    assert!(res.is_err(), "Duplicate finish should fail");
}

// =============================================================================
// TEST 5: Process Refunds
// =============================================================================

#[test]
fn test_process_refunds() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, vault_pubkey) = initialize_event(&mut svm, &payer, &program_id, "evt_ref_1");

    // Register 5 participants
    let mut wallets = vec![];
    for i in 1..=5 {
        let wallet = Keypair::new();
        register_participant(
            &mut svm, &payer, &program_id,
            "evt_ref_1", &event_pda,
            &format!("CHIP_{}", i),
            &wallet.pubkey(),
            &format!("Runner {}", i),
            &format!("RUN_{}", i),
        );
        wallets.push(wallet);
    }

    // Start event
    start_event(&mut svm, &payer, &program_id, "evt_ref_1", &event_pda);

    // Record finish for first 4 participants
    for i in 0..4 {
        let (part_pda, _) = participant_pda(&program_id, &event_pda, &format!("CHIP_{}", i + 1));
        let ix = Instruction::new_with_bytes(
            program_id,
            &solarun_temp::instruction::RecordFinish {
                event_id: "evt_ref_1".to_string(),
                chip_uid: format!("CHIP_{}", i + 1),
                checkpoint_id: 2,
                timestamp: 1700003000 + (i as i64 * 10),
            }.data(),
            solarun_temp::accounts::RecordFinish {
                backend: payer.pubkey(),
                event: event_pda,
                participant: part_pda,
            }.to_account_metas(None),
        );
        send_ix(&mut svm, &payer, ix).expect(&format!("Finish {} failed", i + 1));
    }

    // Fund the vault so it has enough for distribution check
    svm.airdrop(&vault_pubkey, 10_000_000).unwrap();

    // Process refunds
    let finishers = vec![
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "CHIP_1".to_string(), position: 1 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "CHIP_2".to_string(), position: 2 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "CHIP_3".to_string(), position: 3 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "CHIP_4".to_string(), position: 4 },
    ];
    let non_finishers = vec!["CHIP_5".to_string()];
    let recipient_wallets: Vec<_> = wallets.iter().map(|w| w.pubkey()).collect();
    let amounts = vec![5_000_000, 3_000_000, 1_000_000, 500_000, 500_000]; // Total = 10_000_000

    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::ProcessRefunds {
            event_id: "evt_ref_1".to_string(),
            finishers,
            non_finishers,
            recipient_wallets,
            amounts,
        }.data(),
        solarun_temp::accounts::ProcessRefunds {
            admin: payer.pubkey(),
            event: event_pda,
            vault: vault_pubkey,
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );
    send_ix(&mut svm, &payer, ix).expect("Process refunds failed");
}

// =============================================================================
// TEST 6: Access Control
// =============================================================================

#[test]
fn test_process_refunds_unauthorized_should_fail() {
    let (mut svm, payer, program_id) = setup();
    let (event_pda, vault_pubkey) = initialize_event(&mut svm, &payer, &program_id, "evt_ac_1");

    // Fund vault
    svm.airdrop(&vault_pubkey, 10_000_000).unwrap();

    // Create unauthorized signer
    let unauthorized = Keypair::new();
    svm.airdrop(&unauthorized.pubkey(), 1_000_000_000).unwrap();

    // Try process_refunds with unauthorized signer
    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::ProcessRefunds {
            event_id: "evt_ac_1".to_string(),
            finishers: vec![],
            non_finishers: vec![],
            recipient_wallets: vec![],
            amounts: vec![],
        }.data(),
        solarun_temp::accounts::ProcessRefunds {
            admin: unauthorized.pubkey(),
            event: event_pda,
            vault: vault_pubkey,
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );
    let res = send_ix(&mut svm, &unauthorized, ix);
    assert!(res.is_err(), "Unauthorized signer should not be able to call process_refunds");
}

// =============================================================================
// TEST 7: Full End-to-End Flow
// =============================================================================

#[test]
fn test_full_e2e_flow() {
    let (mut svm, payer, program_id) = setup();

    // 1. Initialize Event
    let (event_pda, vault_pubkey) = initialize_event(&mut svm, &payer, &program_id, "evt_e2e");

    // 2. Register 5 participants
    let mut wallets = vec![];
    for i in 1..=5 {
        let wallet = Keypair::new();
        register_participant(
            &mut svm, &payer, &program_id,
            "evt_e2e", &event_pda,
            &format!("E2E_CHIP_{}", i),
            &wallet.pubkey(),
            &format!("E2E Runner {}", i),
            &format!("E2E_RUN_{}", i),
        );
        wallets.push(wallet);
    }

    // 3. Start Event
    start_event(&mut svm, &payer, &program_id, "evt_e2e", &event_pda);

    // 4. Record Finish for 4 participants
    for i in 0..4 {
        let (part_pda, _) = participant_pda(&program_id, &event_pda, &format!("E2E_CHIP_{}", i + 1));
        let ix = Instruction::new_with_bytes(
            program_id,
            &solarun_temp::instruction::RecordFinish {
                event_id: "evt_e2e".to_string(),
                chip_uid: format!("E2E_CHIP_{}", i + 1),
                checkpoint_id: 2,
                timestamp: 1700003000 + (i as i64 * 10),
            }.data(),
            solarun_temp::accounts::RecordFinish {
                backend: payer.pubkey(),
                event: event_pda,
                participant: part_pda,
            }.to_account_metas(None),
        );
        send_ix(&mut svm, &payer, ix).expect(&format!("E2E finish {} failed", i + 1));
    }

    // 5. Fund vault & Process Refunds
    svm.airdrop(&vault_pubkey, 10_000_000).unwrap();

    let finishers = vec![
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "E2E_CHIP_1".to_string(), position: 1 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "E2E_CHIP_2".to_string(), position: 2 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "E2E_CHIP_3".to_string(), position: 3 },
        solarun_temp::instructions::process_refunds::FinisherData { chip_uid: "E2E_CHIP_4".to_string(), position: 4 },
    ];
    let non_finishers = vec!["E2E_CHIP_5".to_string()];
    let recipient_wallets: Vec<_> = wallets.iter().map(|w| w.pubkey()).collect();
    let amounts = vec![5_000_000, 3_000_000, 1_000_000, 500_000, 500_000];

    let ix = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::ProcessRefunds {
            event_id: "evt_e2e".to_string(),
            finishers,
            non_finishers,
            recipient_wallets,
            amounts,
        }.data(),
        solarun_temp::accounts::ProcessRefunds {
            admin: payer.pubkey(),
            event: event_pda,
            vault: vault_pubkey,
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );
    send_ix(&mut svm, &payer, ix).expect("E2E process refunds failed");
}
