import BN from "bn.js";

export interface PrizeShare {
    wallet: string;
    amount: BN;
}

/**
 * Calculates prize distribution based on total vault balance and winners.
 * 
 * Distribution:
 * 1st: 40%
 * 2nd: 30%
 * 3rd: 20%
 * 4th: 10%
 * 
 * @param totalVault Total USDC amount in the vault
 * @param winners Array of winner wallet addresses (ordered 1st to 4th)
 * @returns Array of PrizeShare objects
 */
export function calculatePrizePool(totalVault: BN, winners: string[]): PrizeShare[] {
    // 40%, 30%, 20%, 10% for top 4
    const ratios = [40n, 30n, 20n, 10n]; 
    
    return winners.slice(0, 4).map((wallet, index) => {
        const ratio = ratios[index];
        // Ensure we handle BN correctly with bigint
        const amount = totalVault.mul(new BN(ratio.toString())).div(new BN(100));
        
        return {
            wallet,
            amount
        };
    });
}
