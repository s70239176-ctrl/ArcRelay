"use client";

/**
 * components/ArcRelayDashboard.tsx
 *
 * ArcRelay's dashboard shell. Design direction: a dark, cool-toned
 * instrument panel (not pure black, not the generic acid-on-black default)
 * with a warm gold signature accent tied directly to the subject —
 * settlement, value, currency. The page opens with a live settlement
 * ticker (the hero, per the brief: show the product's real value
 * viscerally before describing it), then the execution console, ledger,
 * and terminal below. Mobile gets a slide-over log drawer and a sticky
 * bottom action bar.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, ExternalLink, ScrollText, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import SettlementTicker from "@/components/SettlementTicker";
import SettlementLedger from "@/components/SettlementLedger";
import X402ExecutionPanel from "@/components/x402ExecutionPanel";
import AgentTerminal from "@/components/AgentTerminal";
import type { LogEntry, NetworkTelemetry, SessionMetrics } from "@/lib/agent-types";

export interface PaymentEvent {
  id: string;
  nodeId: string;
  label: string;
  capability: string;
  amountUsdc: number;
  chain: string;
  txHash: string;
  latencyMs: number;
  timestamp: string;
}

const CHAINS = ["Ethereum", "Arbitrum", "Solana"] as const;

const SETTLEMENT_REGISTRY_ADDRESS = "0x9289A359b8528D407Bd69d49d43EB1d5a76ACE8a";
const SETTLEMENT_REGISTRY_EXPLORER_URL = `https://testnet.arcscan.app/address/${SETTLEMENT_REGISTRY_ADDRESS}#code`;

interface WalletInfo {
  mode: "live" | "mock";
  address: string;
  walletUsdc: number;
  gatewayAvailable: number;
}

export default function ArcRelayDashboard() {
  const [network] = useState<NetworkTelemetry["network"]>("Arc Testnet");
  const [blockHeight, setBlockHeight] = useState(4_812_003);
  const [finalityMs, setFinalityMs] = useState(240);
  const [relayerNodes] = useState({ active: 11, total: 12 });

  const [session, setSession] = useState<SessionMetrics>({
    usdcGasBalance: 14.2204,
    gatewayPoolBalance: 8_402.11,
    sessionSpentUsdc: 0,
    delegatedSigningActive: true,
  });

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [bridgeFrom, setBridgeFrom] = useState<(typeof CHAINS)[number]>("Arbitrum");

  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setBlockHeight((b) => b + 1);
      setFinalityMs(220 + Math.round(Math.random() * 80));
    }, 320);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const fetchWalletInfo = async () => {
    try {
      const res = await fetch("/api/agent/wallet");
      if (!res.ok) return;
      const data = (await res.json()) as {
        mode: "live" | "mock";
        address: string;
        wallet: { usdc: number };
        gateway: { available: number };
      };
      setWalletInfo({
        mode: data.mode,
        address: data.address,
        walletUsdc: data.wallet.usdc,
        gatewayAvailable: data.gateway.available,
      });
      setSession((s) => ({ ...s, usdcGasBalance: data.gateway.available }));
    } catch {
      // Non-fatal — the header falls back to simulated figures.
    }
  };

  useEffect(() => {
    fetchWalletInfo();
    const interval = window.setInterval(fetchWalletInfo, 20_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleLog = (entry: LogEntry) => setLogs((prev) => [...prev, entry]);

  const handlePayment = (p: {
    nodeId: string;
    label: string;
    capability: string;
    amountUsdc: number;
    chain: string;
    txHash: string;
    latencyMs: number;
  }) => {
    setPayments((prev) => [
      { ...p, id: `${p.nodeId}-${Date.now()}`, timestamp: new Date().toISOString() },
      ...prev,
    ]);
    setSession((s) => ({
      ...s,
      usdcGasBalance: Math.max(s.usdcGasBalance - p.amountUsdc, 0),
      gatewayPoolBalance: s.gatewayPoolBalance - p.amountUsdc,
    }));
    fetchWalletInfo();
  };

  const handleSummary = (s: { sessionSpend: number; remainingBalance: number }) => {
    setSession((prev) => ({
      ...prev,
      sessionSpentUsdc: s.sessionSpend,
      usdcGasBalance: s.remainingBalance,
    }));
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav
        network={network}
        blockHeight={blockHeight}
        finalityMs={finalityMs}
        relayerNodes={relayerNodes}
        session={session}
        walletInfo={walletInfo}
        onToggleSigning={() =>
          setSession((s) => ({ ...s, delegatedSigningActive: !s.delegatedSigningActive }))
        }
      />

      <SettlementTicker payments={payments} />

      <main className="mx-auto max-w-[1400px] px-3 sm:px-4 lg:px-6 py-4 pb-24 lg:pb-8">
        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="min-w-0">
            <SectionLabel label="Autonomous Agent Execution Console" />
            <X402ExecutionPanel onLog={handleLog} onPayment={handlePayment} onSummary={handleSummary} />

            <div className="mt-4 hidden lg:block">
              <SectionLabel label="Bridge & Relayer Operations" icon={ArrowLeftRight} />
              <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
            </div>
          </section>

          <section className="hidden min-w-0 lg:flex lg:flex-col lg:gap-4">
            <div>
              <SectionLabel label="Settlement Ledger" icon={ArrowLeftRight} />
              <SettlementLedger payments={payments} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <SectionLabel label="Real-Time Telemetry & Relayer Log" icon={ScrollText} />
              <AgentTerminal logs={logs} className="h-[calc(100vh-460px)] min-h-[280px]" />
            </div>
          </section>

          <section className="min-w-0 lg:hidden">
            <SectionLabel label="Bridge & Relayer Operations" icon={ArrowLeftRight} />
            <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
          </section>
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between border-t border-hairline bg-canvas/95 backdrop-blur-md px-4 py-2.5 lg:hidden">
        <div>
          <div className="text-[10px] font-sans font-medium uppercase tracking-wide text-muted">
            Session Spent
          </div>
          <div className="font-mono text-sm font-semibold tabular text-gold">
            ${session.sessionSpentUsdc.toFixed(4)}
          </div>
        </div>
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-md border border-hairline bg-surface px-3 text-xs font-sans font-medium text-ink"
        >
          <ScrollText className="h-4 w-4 text-gold" />
          Ledger &amp; Logs
          {(payments.length > 0 || logs.length > 0) && (
            <span className="rounded-full bg-gold/15 px-1.5 text-gold">
              {payments.length + logs.length}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 z-50 flex h-[88vh] flex-col gap-3 rounded-t-xl border-t border-hairline-strong bg-canvas p-3 lg:hidden"
            >
              <div className="flex items-center justify-between">
                <span className="font-sans text-sm font-medium text-ink">Ledger &amp; Logs</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline text-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SettlementLedger payments={payments} />
              <AgentTerminal logs={logs} className="min-h-0 flex-1" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArcRelayMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M12 1 L14.4 9.6 L23 12 L14.4 14.4 L12 23 L9.6 14.4 L1 12 L9.6 9.6 Z" fill="var(--color-gold)" />
    </svg>
  );
}

function StatCell({
  label,
  children,
  className,
  title,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn("text-right font-mono text-[11px]", className)} title={title}>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular">{children}</div>
    </div>
  );
}

function TopNav({
  network,
  blockHeight,
  finalityMs,
  relayerNodes,
  session,
  walletInfo,
  onToggleSigning,
}: {
  network: NetworkTelemetry["network"];
  blockHeight: number;
  finalityMs: number;
  relayerNodes: { active: number; total: number };
  session: SessionMetrics;
  walletInfo: WalletInfo | null;
  onToggleSigning: () => void;
}) {
  const animatedBlock = useAnimatedNumber(blockHeight, 280);
  const animatedGateway = useAnimatedNumber(session.usdcGasBalance, 500);
  const animatedSpent = useAnimatedNumber(session.sessionSpentUsdc, 500);

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 overflow-x-auto scrollbar-none px-3 sm:px-4 lg:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <ArcRelayMark />
          <span className="font-mono text-lg font-semibold tracking-tight text-ink">ArcRelay</span>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-mono text-[11px] font-medium text-body">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {network}
        </span>

        {walletInfo && (
          <span
            className={cn(
              "hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-medium sm:inline-flex",
              walletInfo.mode === "live" ? "bg-cyan/10 text-cyan" : "bg-surface text-muted"
            )}
            title={walletInfo.address}
          >
            {walletInfo.mode === "live" ? "Live wallet" : "Mock wallet"}
          </span>
        )}

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted sm:flex">
          <span>Block</span>
          <span className="tabular text-ink">#{Math.round(animatedBlock).toLocaleString()}</span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted md:flex">
          <span>Finality</span>
          <span className="tabular text-cyan">{finalityMs}ms</span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted lg:flex">
          <span>Relayers</span>
          <span className="tabular text-success">
            {relayerNodes.active}/{relayerNodes.total}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <StatCell
            label="Gateway Available"
            className="hidden text-body sm:block"
            title="Spendable via x402 right now"
          >
            ${animatedGateway.toFixed(4)}
          </StatCell>
          {walletInfo && (
            <StatCell
              label="Wallet USDC"
              className="hidden text-muted xl:block"
              title="Plain wallet balance, not yet deposited into the Gateway Wallet"
            >
              ${walletInfo.walletUsdc.toFixed(4)}
            </StatCell>
          )}
          <StatCell label="Session Spent" className="hidden text-gold md:block">
            ${animatedSpent.toFixed(6)}
          </StatCell>

          <button
            onClick={onToggleSigning}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 font-sans text-[12px] font-medium transition-colors",
              session.delegatedSigningActive
                ? "border-success/40 bg-success/10 text-success"
                : "border-hairline text-muted"
            )}
          >
            <Wallet className="h-3.5 w-3.5" />
            {session.delegatedSigningActive ? "Delegated Signing On" : "Signing Off"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SectionLabel({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-0.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted" />}
      <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
    </div>
  );
}

function BridgePanel({
  bridgeFrom,
  setBridgeFrom,
}: {
  bridgeFrom: (typeof CHAINS)[number];
  setBridgeFrom: (c: (typeof CHAINS)[number]) => void;
}) {
  const [amount, setAmount] = useState("500.00");

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <label className="mb-1 block text-[11px] font-sans font-medium uppercase tracking-wide text-muted">
            Source Chain
          </label>
          <select
            value={bridgeFrom}
            onChange={(e) => setBridgeFrom(e.target.value as (typeof CHAINS)[number])}
            className="min-h-[44px] w-full rounded-md border border-hairline bg-surface-sunken px-2.5 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/50"
          >
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-sans font-medium uppercase tracking-wide text-muted">
            Amount (USDC)
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="min-h-[44px] w-full rounded-md border border-hairline bg-surface-sunken px-2.5 font-mono text-sm tabular text-ink focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/50"
          />
        </div>

        <button className="min-h-[44px] rounded-md border border-hairline bg-surface-sunken font-sans text-sm font-medium text-ink transition-colors hover:border-hairline-strong hover:bg-surface-elevated">
          Route via CCTP → Arc L1
        </button>
      </div>

      <p className="mt-3 font-sans text-[13px] leading-relaxed text-muted">
        Burns {amount || "0"} USDC on {bridgeFrom} and mints natively on Arc L1 via Circle&apos;s
        CCTP relayer network — no wrapped assets, no third-party bridge risk.
      </p>

      <a
        href={SETTLEMENT_REGISTRY_EXPLORER_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-cyan hover:underline"
      >
        On-chain settlement audit trail: ArcRelaySettlementRegistry (verified)
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
