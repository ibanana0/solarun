'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30 * 1000, // 30 seconds
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    if (!privyAppId || privyAppId === 'your-privy-app-id-here') {
        // Fallback: render without Privy if no App ID configured
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return (
        <PrivyProvider
            appId={privyAppId}
            config={{
                appearance: {
                    theme: 'light',
                    accentColor: '#18181b',
                    walletChainType: 'solana-only',
                },
                embeddedWallets: {
                    solana: {
                        createOnLogin: 'all-users',
                    },
                },
                loginMethods: ['email', 'google'],
            }}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </PrivyProvider>
    );
}
