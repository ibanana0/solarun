/**
 * Delete Event API
 * Handles deletion of race events with automatic refund to all participants
 * 
 * Workflow:
 * 1. Check if event exists and status is not "settled"
 * 2. Trigger smart contract process_refunds to refund all participants
 * 3. Delete all race_logs, runners, and finally the race_event from Supabase
 * 4. Return success/error response with details
 */

import { supabase } from '../lib/supabase.js';
import { buildProcessRefundsInstruction, buildDeleteEventInstruction, submitTransaction, checkConnection, getAdminKeypair } from '../blockchain/transaction-signer.js';
import { Transaction, Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Delete a race event and refund all participants
 * @param eventId - UUID of the event to delete
 * @returns Object with status, message, and refund details
 */
export async function deleteEventWithRefund(eventId: string) {
    try {
        console.log(`\n🗑️  Deleting event: ${eventId}`);

        // ── Step 1: Fetch event from database ──
        const { data: event, error: eventError } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError || !event) {
            throw new Error(`Event not found: ${eventId}`);
        }

        console.log(`   📋 Event found: ${event.name} (status: ${event.status})`);
        console.log(`   📋 Vault found: ${event.vault_address}`);

        // ── Step 2: Check if event can be deleted (only non-settled events) ──
        if (event.status === 'settled') {
            throw new Error(`Cannot delete settled events. Event ID: ${eventId}`);
        }

        // ── Step 3: Fetch all participants in this event ──
        const { data: participants, error: participantsError } = await supabase
            .from('runners')
            .select('id, wallet_address, chip_uid')
            .eq('event_id', eventId);

        if (participantsError) {
            throw new Error(`Failed to fetch participants: ${participantsError.message}`);
        }

        const participantCount = participants?.length ?? 0;
        console.log(`   👥 Found ${participantCount} participants to refund`);

        // ── Step 4: Trigger smart contract refund (if blockchain is available) ──
        let txSignature = null;
        const isBlockchainHealthy = await checkConnection();

        if (isBlockchainHealthy && participantCount > 0) {
            try {
                console.log(`   ⛓️  Triggering smart contract refund...`);

                const nonFinishers = participants.map(p => p.chip_uid);
                const adminKeypair = getAdminKeypair();
                const wallets = participants.map(p => new PublicKey(p.wallet_address));
                
                // FIX: registration_fee_sol stores display value (e.g. 10 for 10 USDC).
                // Smart contract expects raw token units (6 decimals for Mock USDC).
                // So 10 USDC = 10 * 10^6 = 10,000,000 raw units.
                const MOCK_USDC_DECIMALS = 6;
                const feeDisplayValue = event.registration_fee_sol || 10;
                const refundAmountPerRunner = new anchor.BN(
                    Math.round(feeDisplayValue * Math.pow(10, MOCK_USDC_DECIMALS))
                );
                const amounts = participants.map(() => refundAmountPerRunner);

                // LOG: Detailed refund info
                console.log(`   📊 Refund Details:`);
                console.log(`      - Participants: ${wallets.length}`);
                console.log(`      - Fee (display): ${feeDisplayValue} USDC`);
                console.log(`      - Amount per runner: ${refundAmountPerRunner.toString()} raw units`);
                console.log(`      - Total to refund: ${refundAmountPerRunner.mul(new anchor.BN(wallets.length)).toString()} raw units`);
                console.log(`      - Vault: ${event.vault_address}`);
                console.log(`      - Admin signing: ${adminKeypair.publicKey.toBase58()}`);

                const instruction = await buildProcessRefundsInstruction({
                    eventId: eventId,
                    programId: process.env.SOLARUN_PROGRAM_ID || '',
                    vaultAddress: event.vault_address || '',
                    adminWallet: adminKeypair.publicKey,
                    recipientWallets: wallets,
                    amounts: amounts,
                    nonFinishers: nonFinishers
                });

                // Build and submit refund transaction
                const transaction = new Transaction().add(instruction);
                
                console.log(`   🔐 Signing transaction with admin keypair...`);
                console.log(`   ⚠️  NOTE: This uses backend admin keypair (no Phantom popup)`);
                
                txSignature = await submitTransaction(transaction, [adminKeypair]);
                console.log(`   ✅ Refund transaction submitted: ${txSignature}`);
                
                // Verify transaction details AFTER confirmation
                console.log(`   🔍 Verifying refund transaction on-chain...`);
                const rpc = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
                const txDetails = await rpc.getTransaction(txSignature);
                
                if (txDetails) {
                    console.log(`   ✅ Refund transaction verified on-chain`);
                    console.log(`      - Fee: ${txDetails.meta?.fee} lamports`);
                    console.log(`      - Status: ${txDetails.meta?.err ? '❌ FAILED' : '✅ SUCCESS'}`);
                    
                    if (txDetails.meta?.err) {
                        console.error(`      - Error details: ${JSON.stringify(txDetails.meta.err)}`);
                        throw new Error(`Transaction failed on-chain: ${JSON.stringify(txDetails.meta.err)}`);
                    }
                    
                    console.log(`      - Logs:`);
                    txDetails.meta?.logMessages?.forEach(log => {
                        if (log.includes('ERROR') || log.includes('error') || log.includes('failed')) {
                            console.error(`         📌 ${log}`);
                        } else if (log.includes('Refund') || log.includes('transfer')) {
                            console.log(`         ✓ ${log}`);
                        }
                    });
                } else {
                    console.warn(`   ⚠️  Could not fetch refund transaction details from RPC`);
                }

                // ── Step 4b: Call delete_event to close vault & event PDA on-chain ──
                console.log(`\n   🗑️  Calling delete_event to close on-chain accounts...`);

                // Derive the mint PDA (mock_usdc_mint)
                const programPubkey = new PublicKey(process.env.SOLARUN_PROGRAM_ID || '');
                const [mintPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("mock_usdc_mint")],
                    programPubkey
                );

                // Get admin's ATA for the Mock USDC mint
                const adminAta = await getAssociatedTokenAddress(mintPda, adminKeypair.publicKey);
                console.log(`      Admin ATA: ${adminAta.toBase58()}`);

                const deleteInstruction = await buildDeleteEventInstruction({
                    eventId: eventId,
                    programId: process.env.SOLARUN_PROGRAM_ID || '',
                    vaultAddress: event.vault_address || '',
                    adminWallet: adminKeypair.publicKey,
                    adminTokenAccount: adminAta,
                });

                const deleteTransaction = new Transaction().add(deleteInstruction);
                const deleteTxSig = await submitTransaction(deleteTransaction, [adminKeypair]);
                console.log(`   ✅ delete_event transaction confirmed: ${deleteTxSig}`);
                console.log(`      - Vault closed, remaining USDC → admin ATA`);
                console.log(`      - Event PDA closed, rent → admin wallet`);

            } catch (error) {
                console.warn(`   ⚠️  Smart contract operation failed: ${error}`);
                console.error(`   ❌ Blockchain operation GAGAL: ${error}`);
                
                // Additional debugging info
                if (error instanceof Error) {
                    console.error(`   Error stack: ${error.stack}`);
                }
                
                throw new Error(`Operasi blockchain gagal. Data database tetap dipertahankan. Error: ${error}`);
            }
        } else if (participantCount === 0 && isBlockchainHealthy) {
            console.log(`   ℹ️  No participants to refund, but still cleaning up on-chain...`);
            try {
                const adminKeypair = getAdminKeypair();
                const programPubkey = new PublicKey(process.env.SOLARUN_PROGRAM_ID || '');
                const [mintPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("mock_usdc_mint")],
                    programPubkey
                );
                const adminAta = await getAssociatedTokenAddress(mintPda, adminKeypair.publicKey);

                const deleteInstruction = await buildDeleteEventInstruction({
                    eventId: eventId,
                    programId: process.env.SOLARUN_PROGRAM_ID || '',
                    vaultAddress: event.vault_address || '',
                    adminWallet: adminKeypair.publicKey,
                    adminTokenAccount: adminAta,
                });

                const deleteTransaction = new Transaction().add(deleteInstruction);
                const deleteTxSig = await submitTransaction(deleteTransaction, [adminKeypair]);
                console.log(`   ✅ delete_event transaction confirmed: ${deleteTxSig}`);
            } catch (error) {
                console.warn(`   ⚠️  On-chain cleanup failed: ${error}`);
            }
        } else {
            console.warn(`   ⚠️  Blockchain not available, skipping smart contract operations`);
        }

        // ── Step 5: Delete all race_logs for this event's participants ──
        if (participants && participants.length > 0) {
            const participantIds = participants.map(p => p.id);
            const { error: logsError } = await supabase
                .from('race_logs')
                .delete()
                .in('runner_id', participantIds);

            if (logsError) {
                throw new Error(`Failed to delete race logs: ${logsError.message}`);
            }
            console.log(`   🗑️  Deleted race_logs for all participants`);
        }

        // ── Step 6: Delete all runners in this event ──
        const { error: runnersError } = await supabase
            .from('runners')
            .delete()
            .eq('event_id', eventId);

        if (runnersError) {
            throw new Error(`Failed to delete runners: ${runnersError.message}`);
        }
        console.log(`   🗑️  Deleted all runners`);

        // ── Step 7: Delete the event itself ──
        const { error: eventDeleteError } = await supabase
            .from('race_events')
            .delete()
            .eq('id', eventId);

        if (eventDeleteError) {
            throw new Error(`Failed to delete event: ${eventDeleteError.message}`);
        }
        console.log(`   🗑️  Deleted event from database`);

        // ── Success Response ──
        return {
            status: 'ok',
            message: `Event deleted successfully. ${participantCount} participant(s) refunded.`,
            details: {
                eventId,
                eventName: event.name,
                participantsRefunded: participantCount,
                transactionSignature: txSignature,
                timestamp: new Date().toISOString(),
            },
        };
    } catch (error) {
        console.error(`❌ Error deleting event:`, error);
        return {
            status: 'error',
            message: String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
