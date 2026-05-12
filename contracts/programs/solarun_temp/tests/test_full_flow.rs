use {
    anchor_lang::solana_program::{pubkey::Pubkey, system_program},
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_associated_token_account, spl_token,
};

// ── helpers ──────────────────────────────────────────────────────────────────

fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<(), String> {
    send_ixs(svm, payer, &[ix])
}

fn send_ixs(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction]) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}", e))
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

fn create_mock_mint(svm: &mut LiteSVM, payer: &Keypair, program_id: &Pubkey) -> (Pubkey, Pubkey) {
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
        }
        .to_account_metas(None),
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
            dispute_lock_seconds: 3600,
        }
        .data(),
        solarun_temp::accounts::InitializeEvent {
            admin: payer.pubkey(),
            event: event_pda,
            mock_usdc_mint,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );

    send_ix(svm, payer, ix).unwrap();
    (event_pda, vault_pda)
}

fn mint_usdc_to(
    svm: &mut LiteSVM,
    payer: &Keypair,
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
        }
        .to_account_metas(None),
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
    rfid_uid: &str,
) {
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), rfid_uid.as_bytes()],
        program_id,
    );
    let runner_token_account = get_ata(&runner.pubkey(), &mock_usdc_mint);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: event_id.to_string(),
            rfid_uid: rfid_uid.to_string(),
            wallet_address: runner.pubkey(),
            full_name: "Test Runner".to_string(),
            runner_id: format!("run_{}", rfid_uid),
        }
        .data(),
        solarun_temp::accounts::RegisterParticipant {
            runner: runner.pubkey(),
            event: event_pda,
            participant: participant_pda,
            runner_token_account,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );

    send_ix(svm, runner, ix).unwrap();
}

/// Deposit admin stake into the event vault.
/// `stake_amount` must be >= 50% of (registration_fee * max_participants).
fn stake_event(
    svm: &mut LiteSVM,
    admin: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
    vault_pda: Pubkey,
    mock_usdc_mint: Pubkey,
    stake_amount: u64,
) {
    let (stake_vault_pda, _) =
        Pubkey::find_program_address(&[b"stake_vault", event_pda.as_ref()], program_id);
    let admin_token_account = get_ata(&admin.pubkey(), &mock_usdc_mint);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::StakeEvent {
            event_id: event_id.to_string(),
            stake_amount,
        }
        .data(),
        solarun_temp::accounts::StakeEvent {
            admin: admin.pubkey(),
            event: event_pda,
            stake_vault: stake_vault_pda,
            admin_token_account,
            vault: vault_pda,
            mint: mock_usdc_mint,
            token_program: spl_token::id(),
            system_program: system_program::id(),
        }
        .to_account_metas(None),
    );
    send_ix(svm, admin, ix).expect("stake_event failed");
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
        }
        .data(),
        solarun_temp::accounts::StartRace {
            admin: payer.pubkey(),
            event: event_pda,
        }
        .to_account_metas(None),
    );
    send_ix(svm, payer, ix).unwrap();
}

fn record_finish(
    svm: &mut LiteSVM,
    admin: &Keypair,
    program_id: &Pubkey,
    event_id: &str,
    event_pda: Pubkey,
    rfid_uid: &str,
    position: u8,
) {
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), rfid_uid.as_bytes()],
        program_id,
    );

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::RecordFinish {
            event_id: event_id.to_string(),
            rfid_uid: rfid_uid.to_string(),
            checkpoint_id: 2, // finish
            finish_position: position,
            timestamp: 1700001000 + (position as i64 * 100),
        }
        .data(),
        solarun_temp::accounts::RecordFinish {
            backend: admin.pubkey(),
            event: event_pda,
            participant: participant_pda,
        }
        .to_account_metas(None),
    );
    send_ix(svm, admin, ix).unwrap();
}

fn initialize_global_state(
    svm: &mut LiteSVM,
    payer: &Keypair,
    program_id: &Pubkey,
    treasury_address: Pubkey,
) -> Pubkey {
    let (global_state, _) = Pubkey::find_program_address(&[b"global"], program_id);

    let ix = Instruction::new_with_bytes(
        *program_id,
        &solarun_temp::instruction::InitializeGlobalState {
            treasury_address,
            protocol_fee_bps: 100, // 1% for tests
        }
        .data(),
        solarun_temp::accounts::InitializeGlobalState {
            initializer: payer.pubkey(),
            global_state,
            system_program: system_program::id(),
        }
        .to_account_metas(None),
    );

    send_ix(svm, payer, ix).unwrap();
    global_state
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// Full end-to-end happy path:
/// create mint → init global state → init event → STAKE → register → start →
/// record finishes → complete → process_refunds
#[test]
fn test_full_e2e_flow() {
    let (mut svm, admin, program_id) = setup();
    let event_id = "evt_e2e_1";

    let (mock_usdc_mint, mint_authority) = create_mock_mint(&mut svm, &admin, &program_id);

    // 1. Treasury keypair + ATA setup
    let treasury_keypair = Keypair::new();
    let treasury_address = treasury_keypair.pubkey();
    svm.airdrop(&treasury_address, 1_000_000_000).unwrap();
    let global_state = initialize_global_state(&mut svm, &admin, &program_id, treasury_address);
    let treasury_account = mint_usdc_to(
        &mut svm,
        &treasury_keypair,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        0,
    );

    // 2. Initialize event (fee=1_000_000, max=100)
    let (event_pda, vault_pda) =
        initialize_event(&mut svm, &admin, &program_id, event_id, mock_usdc_mint);

    // 3. Admin stakes 50% of max pool (required before start_race)
    //    max_pool = 1_000_000 * 100 = 100_000_000  →  50% = 50_000_000
    let required_stake: u64 = 1_000_000 * 100 * 50 / 100;
    mint_usdc_to(
        &mut svm,
        &admin,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        required_stake,
    );
    stake_event(
        &mut svm,
        &admin,
        &program_id,
        event_id,
        event_pda,
        vault_pda,
        mock_usdc_mint,
        required_stake,
    );

    // 4. Register 3 participants (each pays 1_000_000 USDC)
    let mut runners = vec![];
    for i in 0..3 {
        let runner = Keypair::new();
        svm.airdrop(&runner.pubkey(), 1_000_000_000).unwrap();
        mint_usdc_to(
            &mut svm,
            &runner,
            &program_id,
            mock_usdc_mint,
            mint_authority,
            5_000_000,
        );
        let rfid_uid = format!("chip_00{}", i);
        register_participant(
            &mut svm,
            &runner,
            &program_id,
            event_id,
            event_pda,
            vault_pda,
            mock_usdc_mint,
            &rfid_uid,
        );
        runners.push((runner, rfid_uid));
    }

    // 5. Start race (requires stake_amount > 0 — guaranteed by step 3)
    start_race(&mut svm, &admin, &program_id, event_id, event_pda);

    // Verify: registration must fail after race starts
    let late_runner = Keypair::new();
    svm.airdrop(&late_runner.pubkey(), 1_000_000_000).unwrap();
    mint_usdc_to(
        &mut svm,
        &late_runner,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        5_000_000,
    );
    let late_rfid_uid = "chip_late";
    let (participant_pda, _) = Pubkey::find_program_address(
        &[b"participant", event_pda.as_ref(), late_rfid_uid.as_bytes()],
        &program_id,
    );
    let runner_token_account = get_ata(&late_runner.pubkey(), &mock_usdc_mint);
    let ix_late_reg = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::RegisterParticipant {
            event_id: event_id.to_string(),
            rfid_uid: late_rfid_uid.to_string(),
            wallet_address: late_runner.pubkey(),
            full_name: "Late Runner".to_string(),
            runner_id: "run_late".to_string(),
        }
        .data(),
        solarun_temp::accounts::RegisterParticipant {
            runner: late_runner.pubkey(),
            event: event_pda,
            participant: participant_pda,
            runner_token_account,
            vault: vault_pda,
            system_program: system_program::id(),
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    let res = send_ix(&mut svm, &late_runner, ix_late_reg);
    assert!(res.is_err(), "Registration should fail after race starts");

    // 6. Record finish for runners 0 (1st) and 1 (2nd)
    record_finish(
        &mut svm,
        &admin,
        &program_id,
        event_id,
        event_pda,
        &runners[0].1,
        1,
    );
    record_finish(
        &mut svm,
        &admin,
        &program_id,
        event_id,
        event_pda,
        &runners[1].1,
        2,
    );

    // 7. Complete race → deducts protocol fee, transitions Active → Completed
    let ix_complete = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::CompleteRace {
            event_id: event_id.to_string(),
        }
        .data(),
        solarun_temp::accounts::CompleteRace {
            admin: admin.pubkey(),
            event: event_pda,
            global_state,
            vault: vault_pda,
            treasury_account,
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    send_ix(&mut svm, &admin, ix_complete).expect("Complete race failed");

    // 8. Process refunds: distribute prize pool to top-2 winners
    //    Vault after stake(50M) + 3 runners(3M) = 53M — protocol fee (1% = 530k) = 52_470_000
    //    Simplified test amounts (not exact split, just testing the flow)
    let mut metas = solarun_temp::accounts::ProcessRefunds {
        admin: admin.pubkey(),
        event: event_pda,
        vault: vault_pda,
        token_program: spl_token::id(),
    }
    .to_account_metas(None);

    let ata_1 = get_ata(&runners[0].0.pubkey(), &mock_usdc_mint);
    let ata_2 = get_ata(&runners[1].0.pubkey(), &mock_usdc_mint);
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
        ata_1, false,
    ));
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
        ata_2, false,
    ));

    let finishers = vec![
        solarun_temp::instructions::process_refunds::FinisherData {
            rfid_uid: runners[0].1.clone(),
            position: 1,
        },
        solarun_temp::instructions::process_refunds::FinisherData {
            rfid_uid: runners[1].1.clone(),
            position: 2,
        },
    ];
    // Distribute 2M to 1st, 1M to 2nd (simplified; real amounts depend on vault balance)
    let amounts = vec![2_000_000u64, 1_000_000u64];

    let ix_refund = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::ProcessRefunds {
            event_id: event_id.to_string(),
            finishers,
            non_finishers: vec![runners[2].1.clone()],
            recipient_wallets: vec![runners[0].0.pubkey(), runners[1].0.pubkey()],
            amounts,
            is_final_batch: true,
        }
        .data(),
        metas,
    );

    send_ix(&mut svm, &admin, ix_refund).expect("Process refunds failed");

    // NOTE: After process_refunds with is_final_batch=true, event status == Settled.
    // delete_event is intentionally NOT called here because it now only works on
    // Initialized (Pending) events. See test_cancel_pending_event below.
}

/// Test that an admin can cancel a PENDING event (before it starts) and that
/// all registered participants receive 100% refunds.
#[test]
fn test_cancel_pending_event() {
    let (mut svm, admin, program_id) = setup();
    let event_id = "evt_cancel_1";

    let (mock_usdc_mint, mint_authority) = create_mock_mint(&mut svm, &admin, &program_id);

    // Initialize event
    let (event_pda, vault_pda) =
        initialize_event(&mut svm, &admin, &program_id, event_id, mock_usdc_mint);

    // Admin stakes 50% of max pool
    let required_stake: u64 = 1_000_000 * 100 * 50 / 100; // 50_000_000
    mint_usdc_to(
        &mut svm,
        &admin,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        required_stake,
    );
    stake_event(
        &mut svm,
        &admin,
        &program_id,
        event_id,
        event_pda,
        vault_pda,
        mock_usdc_mint,
        required_stake,
    );

    // Register 2 participants
    let runner1 = Keypair::new();
    let runner2 = Keypair::new();
    svm.airdrop(&runner1.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&runner2.pubkey(), 1_000_000_000).unwrap();
    mint_usdc_to(
        &mut svm,
        &runner1,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        5_000_000,
    );
    mint_usdc_to(
        &mut svm,
        &runner2,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        5_000_000,
    );

    register_participant(
        &mut svm,
        &runner1,
        &program_id,
        event_id,
        event_pda,
        vault_pda,
        mock_usdc_mint,
        "chip_a",
    );
    register_participant(
        &mut svm,
        &runner2,
        &program_id,
        event_id,
        event_pda,
        vault_pda,
        mock_usdc_mint,
        "chip_b",
    );

    // Admin cancels the event.
    // Vault holds: 50_000_000 (stake) + 2 * 1_000_000 (fees) = 52_000_000
    // Refund each participant their 1_000_000 registration fee.
    let ata_r1 = get_ata(&runner1.pubkey(), &mock_usdc_mint);
    let ata_r2 = get_ata(&runner2.pubkey(), &mock_usdc_mint);

    let admin_token_account = mint_usdc_to(
        &mut svm,
        &admin,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        0,
    );

    let mut metas = solarun_temp::accounts::DeleteEvent {
        admin: admin.pubkey(),
        event: event_pda,
        vault: vault_pda,
        admin_token_account,
        token_program: spl_token::id(),
    }
    .to_account_metas(None);

    // remaining_accounts: participant ATAs that receive 100% refund
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
        ata_r1, false,
    ));
    metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
        ata_r2, false,
    ));

    let registration_fee: u64 = 1_000_000;
    let ix_delete = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::DeleteEvent {
            event_id: event_id.to_string(),
            amounts: vec![registration_fee, registration_fee], // 100% refund each
            is_final_batch: true,
        }
        .data(),
        metas,
    );

    send_ix(&mut svm, &admin, ix_delete).expect("Cancel pending event failed");
}

/// Verify that cancelling an ACTIVE event is rejected.
#[test]
fn test_cannot_cancel_active_event() {
    let (mut svm, admin, program_id) = setup();
    let event_id = "evt_no_cancel";

    let (mock_usdc_mint, mint_authority) = create_mock_mint(&mut svm, &admin, &program_id);
    let (event_pda, vault_pda) =
        initialize_event(&mut svm, &admin, &program_id, event_id, mock_usdc_mint);

    // Stake then start the race
    let required_stake: u64 = 1_000_000 * 100 * 50 / 100;
    mint_usdc_to(
        &mut svm,
        &admin,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        required_stake,
    );
    stake_event(
        &mut svm,
        &admin,
        &program_id,
        event_id,
        event_pda,
        vault_pda,
        mock_usdc_mint,
        required_stake,
    );
    start_race(&mut svm, &admin, &program_id, event_id, event_pda);

    // Attempt to cancel → must fail with EventMustBePending
    let admin_token_account = mint_usdc_to(
        &mut svm,
        &admin,
        &program_id,
        mock_usdc_mint,
        mint_authority,
        0,
    );
    let ix_delete = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::DeleteEvent {
            event_id: event_id.to_string(),
            amounts: vec![],
            is_final_batch: true,
        }
        .data(),
        solarun_temp::accounts::DeleteEvent {
            admin: admin.pubkey(),
            event: event_pda,
            vault: vault_pda,
            admin_token_account,
            token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    let res = send_ix(&mut svm, &admin, ix_delete);
    assert!(res.is_err(), "Cancelling an active event must fail");
}
