"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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
      }),
  );

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId || privyAppId === "your-privy-app-id-here") {
    // Fallback: render without Privy if no App ID configured
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const solanaConnectors = toSolanaWalletConnectors({
    shouldAutoConnect: true,
  });

  const devnetRpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#18181b",
          walletChainType: "solana-only",
        },
        solana: {
          rpcs: {
            // Official CAIP-2 ID for Devnet
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": {
              rpc: createSolanaRpc(devnetRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                devnetRpcUrl.replace("https", "wss"),
              ),
            },
            // Fallback alias for Devnet
            "solana:devnet": {
              rpc: createSolanaRpc(devnetRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                devnetRpcUrl.replace("https", "wss"),
              ),
            },
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "all-users",
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        loginMethods: ["email", "google", "wallet"],
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
