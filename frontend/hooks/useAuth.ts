'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'creator' | 'runner';

export interface SolaRunUser {
    id: string;
    privy_id: string;
    wallet_address: string;
    role: UserRole;
    created_at: string;
}

export function useAuth() {
    const { ready, authenticated, user, login, logout } = usePrivy();
    const [solaRunUser, setSolaRunUser] = useState<SolaRunUser | null>(null);
    const [loading, setLoading] = useState(false);

    // Get embedded wallet address from Privy user
    const walletAddress = user?.wallet?.address ?? null;

    // Sync user to Supabase on login
    useEffect(() => {
        if (!ready || !authenticated || !user) {
            setSolaRunUser(null);
            return;
        }

        const syncUser = async () => {
            setLoading(true);
            try {
                const privyId = user.id;

                // Check if user exists
                const { data: existing } = await supabase
                    .from('users')
                    .select('*')
                    .eq('privy_id', privyId)
                    .single();

                if (existing) {
                    // Update wallet if changed
                    if (walletAddress && existing.wallet_address !== walletAddress) {
                        await supabase
                            .from('users')
                            .update({ wallet_address: walletAddress })
                            .eq('privy_id', privyId);
                        existing.wallet_address = walletAddress;
                    }
                    setSolaRunUser(existing as SolaRunUser);
                } else {
                    // First login — create user with default role 'runner'
                    const { data: newUser, error } = await supabase
                        .from('users')
                        .insert({
                            privy_id: privyId,
                            wallet_address: walletAddress ?? '',
                            role: 'runner',
                        })
                        .select()
                        .single();

                    if (!error && newUser) {
                        setSolaRunUser(newUser as SolaRunUser);
                    }
                }
            } catch (err) {
                console.error('Failed to sync user:', err);
            } finally {
                setLoading(false);
            }
        };

        syncUser();
    }, [ready, authenticated, user, walletAddress]);

    const handleLogout = useCallback(async () => {
        setSolaRunUser(null);
        await logout();
    }, [logout]);

    return {
        ready,
        authenticated,
        privyUser: user,
        solaRunUser,
        walletAddress,
        loading,
        login,
        logout: handleLogout,
        isCreator: solaRunUser?.role === 'creator',
        isRunner: solaRunUser?.role === 'runner',
    };
}
