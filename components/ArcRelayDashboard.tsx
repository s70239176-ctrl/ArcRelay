"use client";

/**
 * components/ArcRelayDashboard.tsx
 *
 * ArcRelay's dashboard shell, restyled to the DESIGN.md warm-editorial
 * system: cream canvas + top-nav, coral primary CTA reserved for the single
 * "Execute Agent" action, and the agent terminal/telemetry treated as a
 * `code-window-card` — a dark navy product surface, per the system's own
 * pattern for showing real product chrome rather than abstract marketing
 * illustration. Mobile viewports get a slide-over log drawer (dark, to
 * match the terminal it holds) plus a cream sticky bottom action bar.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, ScrollText, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import X402ExecutionPanel from "@/components/x402ExecutionPanel";
import AgentTerminal from "@/components/AgentTerminal";
import type { LogEntry, NetworkTelemetry, SessionMetrics } from "@/lib/agent-types";

const CHAINS = ["Ethereum", "Arbitrum", "Solana"] as const;

export default function ArcRelayDashboard() {
  const [network] = useState<NetworkTelemetry["network"]>("Arc Testnet");
  const [blockHeight, setBlockHeight] = useState(4_812_003);
  const [finalityMs, setFinalityMs] = useState(240);
  const [gatewayLiquidity, setGatewayLiquidity] = useState(1_284_912.44);
  const [relayerNodes] = useState({ active: 11, total: 12 });

  const [session, setSession] = useState<SessionMetrics>({
    usdcGasBalance: 14.2204,
    gatewayPoolBalance: 8_402.11,
    sessionSpentUsdc: 0,
    delegatedSigningActive: true,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [bridgeFrom, setBridgeFrom] = useState<(typeof CHAINS)[number]>("Arbitrum");

  const tickRef = useRef<number | null>(null);

  // Simulate a live sub-second Arc L1 block counter + gentle telemetry drift.
  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setBlockHeight((b) => b + 1);
      setFinalityMs(220 + Math.round(Math.random() * 80));
      setGatewayLiquidity((v) => v + (Math.random() - 0.5) * 40);
    }, 320);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const handleLog = (entry: LogEntry) => setLogs((prev) => [...prev, entry]);

  const handlePayment = (p: { amountUsdc: number }) => {
    setSession((s) => ({
      ...s,
      usdcGasBalance: Math.max(s.usdcGasBalance - p.amountUsdc, 0),
      gatewayPoolBalance: s.gatewayPoolBalance - p.amountUsdc,
    }));
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
        gatewayLiquidity={gatewayLiquidity}
        relayerNodes={relayerNodes}
        session={session}
        onToggleSigning={() =>
          setSession((s) => ({ ...s, delegatedSigningActive: !s.delegatedSigningActive }))
        }
      />

      <main className="mx-auto max-w-[1400px] px-3 sm:px-4 lg:px-6 py-4 pb-24 lg:pb-8">
        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Autonomous Agent Execution Console */}
          <section className="min-w-0">
            <SectionLabel label="Autonomous Agent Execution Console" />
            <X402ExecutionPanel onLog={handleLog} onPayment={handlePayment} onSummary={handleSummary} />

            <div className="mt-4 hidden lg:block">
              <SectionLabel label="Bridge & Relayer Operations" icon={ArrowLeftRight} />
              <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
            </div>
          </section>

          {/* Desktop: terminal always visible in right column, dark product surface */}
          <section className="hidden min-w-0 lg:block">
            <SectionLabel label="Real-Time Telemetry & Relayer Log" icon={ScrollText} />
            <AgentTerminal logs={logs} className="h-[calc(100vh-220px)]" />
          </section>

          {/* Mobile: bridge panel below the console */}
          <section className="min-w-0 lg:hidden">
            <SectionLabel label="Bridge & Relayer Operations" icon={ArrowLeftRight} />
            <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
          </section>
        </div>
      </main>

      {/* Mobile sticky action bar — cream, hairline top border */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between border-t border-hairline bg-canvas/95 backdrop-blur-md px-4 py-2.5 lg:hidden">
        <div>
          <div className="text-[10px] font-sans font-medium uppercase tracking-caption text-muted">
            Session Spent
          </div>
          <div
            className="font-mono text-sm font-semibold text-primary"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            ${session.sessionSpentUsdc.toFixed(4)}
          </div>
        </div>
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-md border border-hairline bg-surface-card px-3 text-xs font-sans font-medium text-ink"
        >
          <ScrollText className="h-4 w-4 text-primary" />
          Agent Logs
          {logs.length > 0 && (
            <span className="rounded-pill bg-primary/10 px-1.5 text-primary">{logs.length}</span>
          )}
        </button>
      </div>

      {/* Mobile slide-over drawer — dark surface, matches the terminal it holds */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 z-50 h-[85vh] rounded-t-xl border-t border-surface-dark-elevated bg-surface-dark p-3 lg:hidden"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-sans text-sm font-medium text-on-dark">Agent Logs</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-surface-dark-elevated text-on-dark-soft"
                  aria-label="Close logs drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <AgentTerminal logs={logs} className="h-[calc(85vh-64px)]" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wordmark — a small abstract 4-point mark, distinct from any third-party
// brand glyph; ArcRelay's own mark, not a reuse of another company's logo.
// ---------------------------------------------------------------------------

function ArcRelayMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        d="M12 1 L14.4 9.6 L23 12 L14.4 14.4 L12 23 L9.6 14.4 L1 12 L9.6 9.6 Z"
        fill="var(--color-primary)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Top navigation
// ---------------------------------------------------------------------------

function TopNav({
  network,
  blockHeight,
  finalityMs,
  gatewayLiquidity,
  relayerNodes,
  session,
  onToggleSigning,
}: {
  network: NetworkTelemetry["network"];
  blockHeight: number;
  finalityMs: number;
  gatewayLiquidity: number;
  relayerNodes: { active: number; total: number };
  session: SessionMetrics;
  onToggleSigning: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 overflow-x-auto scrollbar-none px-3 sm:px-4 lg:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <ArcRelayMark />
          <span className="font-display text-xl font-normal tracking-display-sm text-ink">
            ArcRelay
          </span>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-pill bg-surface-card px-3 py-1 font-mono text-[11px] font-medium text-body-strong">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {network}
        </span>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted sm:flex">
          <span>Block</span>
          <span className="text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>
            #{blockHeight.toLocaleString()}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted md:flex">
          <span>Finality</span>
          <span className="text-accent-teal">{finalityMs}ms</span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted lg:flex">
          <span>Gateway Liquidity</span>
          <span className="text-body-strong" style={{ fontVariantNumeric: "tabular-nums" }}>
            ${gatewayLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted lg:flex">
          <span>Relayers</span>
          <span className="text-success">
            {relayerNodes.active}/{relayerNodes.total}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden sm:block text-right font-mono text-[11px]">
            <div className="uppercase tracking-caption text-muted-soft text-[10px]">Gas Balance</div>
            <div className="text-body-strong" style={{ fontVariantNumeric: "tabular-nums" }}>
              ${session.usdcGasBalance.toFixed(4)}
            </div>
          </div>
          <div className="hidden md:block text-right font-mono text-[11px]">
            <div className="uppercase tracking-caption text-muted-soft text-[10px]">Session Spent</div>
            <div className="text-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
              ${session.sessionSpentUsdc.toFixed(6)}
            </div>
          </div>

          <button
            onClick={onToggleSigning}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 font-sans text-[12px] font-medium transition-colors",
              session.delegatedSigningActive
                ? "border-success/40 bg-success/10 text-body-strong"
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

// ---------------------------------------------------------------------------
// Section label — caption-uppercase per DESIGN.md typography table
// ---------------------------------------------------------------------------

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
      <span className="font-sans text-[12px] font-medium uppercase tracking-caption text-muted">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bridge & relayer operations panel — cream feature-card
// ---------------------------------------------------------------------------

function BridgePanel({
  bridgeFrom,
  setBridgeFrom,
}: {
  bridgeFrom: (typeof CHAINS)[number];
  setBridgeFrom: (c: (typeof CHAINS)[number]) => void;
}) {
  const [amount, setAmount] = useState("500.00");

  return (
    <div className="rounded-lg bg-surface-card p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <label className="mb-1 block text-[11px] font-sans font-medium uppercase tracking-caption text-muted">
            Source Chain
          </label>
          <select
            value={bridgeFrom}
            onChange={(e) => setBridgeFrom(e.target.value as (typeof CHAINS)[number])}
            className="min-h-[44px] w-full rounded-md border border-hairline bg-canvas px-2.5 font-sans text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50"
          >
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-sans font-medium uppercase tracking-caption text-muted">
            Amount (USDC)
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="min-h-[44px] w-full rounded-md border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50"
            style={{ fontVariantNumeric: "tabular-nums" }}
          />
        </div>

        <button className="min-h-[44px] rounded-md border border-hairline bg-canvas font-sans text-sm font-medium text-ink transition-colors hover:bg-surface-cream-strong">
          Route via CCTP → Arc L1
        </button>
      </div>

      <p className="mt-3 font-sans text-[13px] leading-relaxed text-muted">
        Burns {amount || "0"} USDC on {bridgeFrom} and mints natively on Arc L1 via Circle&apos;s
        CCTP relayer network — no wrapped assets, no third-party bridge risk.
      </p>
    </div>
  );
}
