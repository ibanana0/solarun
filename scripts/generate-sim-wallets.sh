#!/bin/bash

# Create directory if it doesn't exist
mkdir -p backend/sim-wallets

echo "Generating simulation wallets..."

for i in {1..3}
do
    WALLET_FILE="backend/sim-wallets/runner${i}.json"
    if [ -f "$WALLET_FILE" ]; then
        echo "Wallet ${i} already exists at ${WALLET_FILE}. Skipping."
    else
        echo "Generating wallet ${i}..."
        solana-keygen new --no-bip39-passphrase --outfile "$WALLET_FILE" > /dev/null
        # Extract public key
        PUBKEY=$(solana-keygen pubkey "$WALLET_FILE")
        echo "Wallet ${i} Pubkey: ${PUBKEY}"
        
        # Airdrop SOL (commented out by default to avoid rate limits, uncomment if needed)
        # echo "Requesting airdrop for ${PUBKEY}..."
        # solana airdrop 2 "$PUBKEY" --url devnet
    fi
done

echo "Simulation wallets ready!"
