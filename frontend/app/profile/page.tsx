"use client";

import { useAuth } from "@/hooks/useAuth";
import { useBalance } from "@/hooks/useBalance";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Lock,
  LogOut,
  History,
  ArrowRight,
  Activity,
  Shield,
} from "lucide-react";
import { FakeBeaconButton } from "@/components/FakeBeaconButton";
import Link from "next/link";

export default function ProfilePage() {
  const { authenticated, walletAddress, logout, login, ready } = useAuth();
  const { solBalance, usdcBalance } = useBalance();

  const truncatedWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "—";

  /* ── Not Authenticated ──────────────────────────────────────── */
  if (ready && !authenticated) {
    return (
      <div className="bg-background text-on-background min-h-screen flex flex-col items-center justify-center px-margin">
        <Lock className="h-16 w-16 mb-lg opacity-30" />
        <h1 className="font-headline-md text-headline-md mb-md uppercase">
          WALLET NOT CONNECTED
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-xl text-center max-w-md">
          Connect your wallet to view your athlete profile, race history, and
          pending rewards.
        </p>
        <button
          onClick={login}
          className="font-label-caps text-label-caps border-2 border-primary px-xl py-md hover:bg-primary hover:text-on-primary transition-none active:translate-y-1"
        >
          CONNECT WALLET
        </button>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-sm">
      <main className="flex-grow w-full px-margin py-xl max-w-7xl mx-auto">
        {/* ── Header: Wallet & Balance ──────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-gutter mb-xl items-end">
          <div className="md:col-span-8">
            <span className="font-label-caps text-label-caps text-on-surface-variant block mb-sm">
              ATHLETE WALLET ADDRESS
            </span>
            <h1 className="font-data-lg text-data-lg break-all">
              {walletAddress ?? "—"}
            </h1>
          </div>
          <div className="md:col-span-4 md:text-right">
            <span className="font-label-caps text-label-caps text-on-surface-variant block mb-sm">
              WALLET BALANCE
            </span>
            <div className="font-headline-lg text-headline-lg">
              {usdcBalance.toFixed(2)}{" "}
              <span className="text-on-surface-variant text-[24px]">USDC</span>
            </div>
            <div className="font-label-caps text-label-caps text-on-surface-variant mt-xs">
              {solBalance.toFixed(3)} SOL
            </div>
          </div>
        </section>

        {/* ── Main Dashboard Grid ───────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          {/* LEFT COLUMN */}
          <div className="md:col-span-4 flex flex-col gap-gutter">
            {/* BLE Beacon — Fake trigger for IoT demo */}
            <FakeBeaconButton
              runnerId={
                walletAddress
                  ? `RUNNER_${walletAddress.slice(-6).toUpperCase()}`
                  : "RUNNER_CHIP"
              }
            />

            {/* Pending Rewards (Template) */}
            <div className="border-2 border-primary p-lg bg-primary text-on-primary">
              <h2 className="font-label-caps text-label-caps mb-md">
                PENDING REWARDS
              </h2>
              <div className="font-headline-md text-headline-md mb-lg">
                — USDC
              </div>
              <button
                disabled
                className="w-full border-2 border-on-primary py-md font-label-caps text-label-caps opacity-50 cursor-not-allowed"
              >
                CLAIM ON-CHAIN (COMING SOON)
              </button>
            </div>

            {/* Disconnect */}
            <button
              onClick={logout}
              className="w-full border-2 border-primary py-md font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-none flex items-center justify-center gap-sm"
            >
              <LogOut className="h-4 w-4 text-inherit" />
              DISCONNECT WALLET
            </button>
          </div>

          {/* RIGHT COLUMN: Race History (Template) */}
          <div className="md:col-span-8">
            <div className="border-2 border-primary p-lg h-full">
              <div className="flex items-center justify-between mb-xl">
                <h2 className="font-label-caps text-label-caps">
                  RACE HISTORY
                </h2>
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  TOTAL RACES: —
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-primary font-label-caps text-label-caps text-on-surface-variant">
                      <th className="py-md pr-md">EVENT</th>
                      <th className="py-md px-md">STATUS</th>
                      <th className="py-md px-md">POSITION</th>
                      <th className="py-md px-md">CHIP_UID</th>
                      <th className="py-md pl-md text-right">ON-CHAIN TX</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm">
                    {/* Template placeholder rows */}
                    <tr className="border-b border-outline-variant">
                      <td colSpan={5} className="py-xl text-center">
                        <div className="flex flex-col items-center gap-md opacity-40">
                          <History className="h-12 w-12" />
                          <p className="font-label-caps text-label-caps">
                            NO RACE HISTORY YET
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Race data will appear here once you participate in
                            events.
                          </p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-lg flex justify-center">
                <Button
                  asChild
                  variant="ghost"
                  className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none rounded-none"
                >
                  <Link href="/events">
                    BROWSE AVAILABLE RACES
                    <ArrowRight className="h-4 w-4 ml-xs" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="flex flex-col md:flex-row justify-between items-center w-full px-margin py-lg gap-gutter border-t-2 border-primary bg-background">
        <div className="font-headline-md text-headline-md text-primary">
          SOLARUN
        </div>
        <div className="flex flex-col items-center gap-sm">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            © 2026 SOLARUN PROTOCOL // ALL PERFORMANCE DATA ON-CHAIN
          </div>
          <div className="flex gap-lg">
            <a
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
              href="#"
            >
              DOCS
            </a>
            <a
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
              href="https://github.com/Ibanana/solarun"
              target="_blank"
              rel="noreferrer"
            >
              GITHUB
            </a>
            <a
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
              href="#"
            >
              AUDIT
            </a>
            <a
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-none"
              href="#"
            >
              PRIVACY
            </a>
          </div>
        </div>
        <div className="flex gap-md">
          <Activity className="h-5 w-5 text-primary" />
          <Shield className="h-5 w-5 text-primary" />
        </div>
      </footer>
    </div>
  );
}
