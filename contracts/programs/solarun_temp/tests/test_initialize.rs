
use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_keypair::Keypair,
    solana_transaction::versioned::VersionedTransaction,
};

#[test]
fn test_initialize() {
    let program_id = solarun_temp::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/solarun_temp.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    let event_id = "test_event".to_string();
    let vault_capacity = 100_000_000;
    let registration_fee = 1_000_000;
    let start_time = 1700000000;
    let end_time = 1700003600;

    let (event_pda, _bump) = anchor_lang::solana_program::pubkey::Pubkey::find_program_address(
        &[b"event", event_id.as_bytes()],
        &program_id,
    );
    let vault_keypair = Keypair::new();

    let instruction = Instruction::new_with_bytes(
        program_id,
        &solarun_temp::instruction::InitializeEvent {
            event_id,
            vault_capacity,
            registration_fee,
            start_time,
            end_time,
        }.data(),
        solarun_temp::accounts::InitializeEvent {
            admin: payer.pubkey(),
            event: event_pda,
            vault: vault_keypair.pubkey(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }.to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok());
}
