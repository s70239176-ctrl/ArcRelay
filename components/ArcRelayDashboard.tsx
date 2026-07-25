"use client";

/**
 * components/ArcRelayDashboard.tsx
 *
 * Institutional-grade dashboard shell for ArcRelay. Owns network telemetry
 * (simulated sub-second Arc L1 block counter, gateway liquidity, relayer
 * health), session metrics (gas balance, gateway pool, spend), and composes
 * the Agent Execution Console (x402ExecutionPanel) with the Relayer Log
 * Terminal (AgentTerminal). Mobile viewports get a slide-over drawer for
 * logs plus a sticky bottom action bar; desktop gets a fixed two-pane grid.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeftRight,
  Layers,
  Radio,
  ScrollText,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import X402ExecutionPanel from "@/components/x402ExecutionPanel";
import AgentTerminal from "@/components/AgentTerminal";
import type {
  LogEntry,
  NetworkTelemetry,
  SessionMetrics,
} from "@/lib/agent-types";

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
    <div className="min-h-screen bg-[#07080C] text-slate-200">
      <ControlHeader
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

      <main className="mx-auto max-w-[1500px] px-3 sm:px-4 lg:px-6 py-4 pb-24 lg:pb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Autonomous Agent Execution Console */}
          <section className="min-w-0">
            <SectionLabel icon={Activity} label="Autonomous Agent Execution Console" />
            <X402ExecutionPanel
              onLog={handleLog}
              onPayment={handlePayment}
              onSummary={handleSummary}
            />

            <div className="mt-4 hidden lg:block">
              <SectionLabel icon={ArrowLeftRight} label="Bridge & Relayer Operations" />
              <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
            </div>
          </section>

          {/* Desktop: Terminal always visible in right column */}
          <section className="hidden min-w-0 lg:block">
            <SectionLabel icon={ScrollText} label="Real-Time Telemetry & Relayer Log" />
            <AgentTerminal logs={logs} className="h-[calc(100vh-220px)]" />
          </section>

          {/* Mobile: Bridge panel below the console */}
          <section className="min-w-0 lg:hidden">
            <SectionLabel icon={ArrowLeftRight} label="Bridge & Relayer Operations" />
            <BridgePanel bridgeFrom={bridgeFrom} setBridgeFrom={setBridgeFrom} />
          </section>
        </div>
      </main>

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between border-t border-[#1F2232] bg-[#07080C]/95 backdrop-blur-md px-4 py-2.5 lg:hidden">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
            Session Spent
          </div>
          <div className="font-mono text-sm font-semibold text-[#00F0FF]">
            ${session.sessionSpentUsdc.toFixed(4)}
          </div>
        </div>
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-md border border-[#1F2232] bg-[#0D0E15] px-3 text-xs font-mono text-slate-300"
        >
          <ScrollText className="h-4 w-4 text-[#00F0FF]" />
          Agent Logs
          {logs.length > 0 && (
            <span className="rounded-full bg-[#00F0FF]/15 px-1.5 text-[#67e8f9]">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* Mobile slide-over drawer for logs / payload inspector */}
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
              className="fixed inset-x-0 bottom-0 z-50 h-[85vh] rounded-t-xl border-t border-[#1F2232] bg-[#07080C] p-3 lg:hidden"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm text-slate-300">Agent Logs</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[#1F2232] text-slate-400"
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
// Control header
// ---------------------------------------------------------------------------

function ControlHeader({
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
    <header className="sticky top-0 z-30 border-b border-[#1F2232] bg-[#07080C]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-3 sm:px-4 lg:px-6 h-14 overflow-x-auto scrollbar-none">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#00F0FF] to-[#8B5CF6]">
            <Layers className="h-4 w-4 text-[#07080C]" />
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight text-slate-50">
            ArcRelay
          </span>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-1 font-mono text-[11px] text-[#10B981]">
          <Radio className="h-3 w-3" />
          {network}
        </span>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-slate-400 sm:flex">
          <span className="text-slate-600">Block</span>
          <span
            className="text-[#00F0FF]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            #{blockHeight.toLocaleString()}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-slate-400 md:flex">
          <span className="text-slate-600">Finality</span>
          <span className="text-[#10B981]">{finalityMs}ms</span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-slate-400 lg:flex">
          <span className="text-slate-600">Gateway Liquidity</span>
          <span className="text-slate-200" style={{ fontVariantNumeric: "tabular-nums" }}>
            ${gatewayLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-slate-400 lg:flex">
          <span className="text-slate-600">Relayers</span>
          <span className="text-[#10B981]">
            {relayerNodes.active}/{relayerNodes.total}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden sm:block text-right font-mono text-[11px]">
            <div className="text-slate-600 uppercase tracking-wider text-[10px]">
              Gas Balance
            </div>
            <div className="text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
              ${session.usdcGasBalance.toFixed(4)}
            </div>
          </div>
          <div className="hidden md:block text-right font-mono text-[11px]">
            <div className="text-slate-600 uppercase tracking-wider text-[10px]">
              Session Spent
            </div>
            <div className="text-[#00F0FF]" style={{ fontVariantNumeric: "tabular-nums" }}>
              ${session.sessionSpentUsdc.toFixed(6)}
            </div>
          </div>

          <button
            onClick={onToggleSigning}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] transition-colors",
              session.delegatedSigningActive
                ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#6ee7b7]"
                : "border-[#1F2232] text-slate-500"
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
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-0.5">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bridge & relayer operations panel
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
    <div className="rounded-lg border border-[#1F2232] bg-[#0D0E15] p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <label className="mb-1 block text-[11px] font-mono uppercase tracking-wider text-slate-500">
            Source Chain
          </label>
          <select
            value={bridgeFrom}
            onChange={(e) => setBridgeFrom(e.target.value as (typeof CHAINS)[number])}
            className="min-h-[44px] w-full rounded-md border border-[#1F2232] bg-[#07080C] px-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00F0FF]/30"
          >
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-mono uppercase tracking-wider text-slate-500">
            Amount (USDC)
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="min-h-[44px] w-full rounded-md border border-[#1F2232] bg-[#07080C] px-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00F0FF]/30"
            style={{ fontVariantNumeric: "tabular-nums" }}
          />
        </div>

        <button className="min-h-[44px] rounded-md border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 font-mono text-xs font-medium text-[#c4b5fd] transition-colors hover:bg-[#8B5CF6]/20">
          Route via CCTP → Arc L1
        </button>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-500">
        Burns {amount || "0"} USDC on {bridgeFrom} and mints natively on Arc
        L1 via Circle's CCTP relayer network — no wrapped assets, no
        third-party bridge risk.
      </p>
    </div>
  );
}
