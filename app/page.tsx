"use client";

/**
 * app/page.tsx
 *
 * ArcRelay — AI Agent Execution Workbench.
 * Client component owning: the streaming text buffer from the orchestrator
 * SSE connection, the live settlement-tape transaction list, and the
 * mobile workspace/settlements tab toggle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentEvent {
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

type MobileTab = "workspace" | "settlements";

const PRESETS = [
  "Contract Vulnerability Scan",
  "SEC 10-K Intelligence",
  "Cross-Chain Liquidity Routing",
  "Market Sentiment Sweep",
];

const PRESET_PROMPTS: Record<string, string> = {
  "Contract Vulnerability Scan":
    "Audit this smart contract for reentrancy and access-control vulnerabilities.",
  "SEC 10-K Intelligence":
    "Fetch the latest SEC 10-K filing deltas and summarize new risk factors.",
  "Cross-Chain Liquidity Routing":
    "Find the optimal cross-chain liquidity route with lowest slippage.",
  "Market Sentiment Sweep":
    "Score current market sentiment and flag any bearish shifts.",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ArcRelayPage() {
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [balance, setBalance] = useState(14.2204);
  const [sessionSpend, setSessionSpend] = useState(0);
  const [totalLatency, setTotalLatency] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>("workspace");
  const [walletMode, setWalletMode] = useState<"live" | "mock">("mock");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText]);

  const runOrchestration = useCallback(async (submittedPrompt: string) => {
    if (!submittedPrompt.trim() || isRunning) return;

    setIsRunning(true);
    setStreamText("");
    setMobileTab("workspace");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: submittedPrompt }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response stream from orchestrator.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const eventType = eventLine.replace("event: ", "").trim();
          const rawData = dataLine.replace("data: ", "");

          if (eventType === "text") {
            setStreamText((prev) => prev + rawData);
          } else if (eventType === "payment") {
            const parsed = JSON.parse(rawData) as Omit<PaymentEvent, "id">;
            setPayments((prev) => [
              { ...parsed, id: `${parsed.nodeId}-${parsed.timestamp}` },
              ...prev,
            ]);
            setSessionSpend((prev) => prev + parsed.amountUsdc);
            setTotalLatency((prev) => prev + parsed.latencyMs);
            setMobileTab((tab) => (tab === "settlements" ? "settlements" : tab));
          } else if (eventType === "summary") {
            const parsed = JSON.parse(rawData) as {
              remainingBalance: number;
            };
            setBalance(parsed.remainingBalance);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setStreamText(
          (prev) =>
            prev +
            `\n! Connection error: ${err instanceof Error ? err.message : "unknown"}`
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [isRunning]);

  const handleSubmit = useCallback(() => {
    runOrchestration(prompt);
  }, [prompt, runOrchestration]);

  const handlePreset = useCallback(
    (preset: string) => {
      const text = PRESET_PROMPTS[preset] ?? preset;
      setPrompt(text);
      runOrchestration(text);
    },
    [runOrchestration]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  const gasSaved = sessionSpend; // Arc native-USDC-gas + Gateway batching removes a separate gas leg

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-16 lg:pb-0">
      <TopHeader balance={balance} walletMode={walletMode} />

      <MobileTabSwitcher
        active={mobileTab}
        onChange={setMobileTab}
        settlementCount={payments.length}
      />

      <main className="mx-auto max-w-[1400px] px-3 sm:px-4 lg:px-6 pt-3 lg:pt-6 lg:grid lg:grid-cols-[65%_35%] lg:gap-6">
        {/* MAIN STUDIO PANEL */}
        <section
          className={`${mobileTab === "workspace" ? "block" : "hidden"} lg:block`}
        >
          <CommandBar
            prompt={prompt}
            setPrompt={setPrompt}
            onSubmit={handleSubmit}
            isRunning={isRunning}
            presets={PRESETS}
            onPreset={handlePreset}
          />
          <StreamingWorkspace text={streamText} isRunning={isRunning} scrollRef={scrollRef} />
        </section>

        {/* ARC L1 SETTLEMENT TAPE */}
        <aside
          className={`${mobileTab === "settlements" ? "block" : "hidden"} lg:block mt-4 lg:mt-0`}
        >
          <SettlementTape
            payments={payments}
            sessionSpend={sessionSpend}
            gasSaved={gasSaved}
            totalLatency={totalLatency}
          />
        </aside>
      </main>

      <MobileBottomBar balance={balance} sessionSpend={sessionSpend} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function TopHeader({
  balance,
  walletMode,
}: {
  balance: number;
  walletMode: "live" | "mock";
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center justify-center">
            <span className="font-mono text-sm font-bold text-slate-950">AF</span>
          </div>
          <span className="font-mono text-base sm:text-lg font-semibold tracking-tight text-slate-50 truncate">
            ArcRelay
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Arc L1 Testnet
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
              Wallet Balance
            </div>
            <div className="font-mono text-sm font-semibold text-slate-100">
              ${balance.toFixed(4)}{" "}
              <span className="text-emerald-500">USDC</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 sm:hidden">
            <div className="font-mono text-xs font-semibold text-slate-100">
              ${balance.toFixed(2)}
            </div>
          </div>
          <span className="hidden md:inline-block rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-500 uppercase tracking-wide">
            {walletMode === "mock" ? "mock signer" : "live signer"}
          </span>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Mobile tab switcher
// ---------------------------------------------------------------------------

function MobileTabSwitcher({
  active,
  onChange,
  settlementCount,
}: {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  settlementCount: number;
}) {
  return (
    <div className="lg:hidden sticky top-16 z-20 flex border-b border-slate-800 bg-slate-950">
      {(
        [
          { key: "workspace" as const, label: "Workspace" },
          { key: "settlements" as const, label: `Arc Settlement Feed (${settlementCount})` },
        ]
      ).map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 min-h-[44px] px-3 text-sm font-mono transition-colors border-b-2 ${
            active === tab.key
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
              : "border-transparent text-slate-500"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command bar
// ---------------------------------------------------------------------------

function CommandBar({
  prompt,
  setPrompt,
  onSubmit,
  isRunning,
  presets,
  onPreset,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  isRunning: boolean;
  presets: string[];
  onPreset: (p: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-3 -mx-1 px-1">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => onPreset(preset)}
            disabled={isRunning}
            className="shrink-0 min-h-[44px] whitespace-nowrap rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 text-xs sm:text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:opacity-40 disabled:pointer-events-none"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Audit this smart contract and fetch live SEC filings for market context"'
          rows={3}
          className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 p-3 pr-3 pb-14 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
        />
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-500">
            ⌘ + Enter
          </span>
          <button
            onClick={onSubmit}
            disabled={isRunning || !prompt.trim()}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
          >
            {isRunning ? "Running…" : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming workspace
// ---------------------------------------------------------------------------

function StreamingWorkspace({
  text,
  isRunning,
  scrollRef,
}: {
  text: string;
  isRunning: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hasContent = text.length > 0;

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-black/40 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        </div>
        <span className="font-mono text-xs text-slate-500 ml-1">
          orchestrator@arcrelay — agent-stream
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-mono text-amber-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
            processing
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="h-[360px] sm:h-[440px] lg:h-[calc(100vh-280px)] overflow-y-auto px-4 py-4 font-mono text-[13px] leading-relaxed"
      >
        {!hasContent && !isRunning && (
          <p className="text-slate-600">
            Awaiting execution — submit a prompt or select a preset above to
            start streaming agent output.
          </p>
        )}
        <pre className="whitespace-pre-wrap break-words text-slate-300">
          {text}
          {isRunning && (
            <span className="inline-block w-2 h-4 align-middle bg-emerald-500 ml-0.5 animate-pulse" />
          )}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settlement tape
// ---------------------------------------------------------------------------

function SettlementTape({
  payments,
  sessionSpend,
  gasSaved,
  totalLatency,
}: {
  payments: PaymentEvent[];
  sessionSpend: number;
  gasSaved: number;
  totalLatency: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col lg:h-[calc(100vh-100px)] lg:sticky lg:top-32">
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold text-slate-200">
          Arc L1 Settlement Tape
        </h2>
        <span className="font-mono text-[11px] text-slate-500">
          {payments.length} settled
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[420px] lg:max-h-none">
        {payments.length === 0 && (
          <p className="text-xs text-slate-600 font-mono px-1 py-6 text-center">
            No settlements yet. Nanopayments will appear here in real time as
            sub-agents fulfil jobs.
          </p>
        )}
        <AnimatePresence initial={false}>
          {payments.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Settled on Arc L1
                </span>
                <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                  ${p.amountUsdc.toFixed(4)} USDC
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">
                    {p.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {p.capability}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[11px] text-indigo-300">
                    {p.latencyMs}ms
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <a
                  href={`https://arc-testnet.explorer.circle.com/tx/${p.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  {p.txHash.slice(0, 6)}...{p.txHash.slice(-4)}
                </a>
                <span>
                  {new Date(p.timestamp).toLocaleTimeString(undefined, {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                  .{new Date(p.timestamp).getMilliseconds().toString().padStart(3, "0")}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-slate-800 px-4 py-3 grid grid-cols-3 gap-2">
        <Stat label="Session Cost" value={`$${sessionSpend.toFixed(4)}`} accent="emerald" />
        <Stat label="Gas Saved" value={`$${gasSaved.toFixed(4)}`} accent="cyan" />
        <Stat label="Latency" value={`${totalLatency}ms`} accent="indigo" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "cyan" | "indigo";
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    indigo: "text-indigo-400",
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono truncate">
        {label}
      </div>
      <div className={`font-mono text-sm font-semibold ${colorMap[accent]} truncate`}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom bar
// ---------------------------------------------------------------------------

function MobileBottomBar({
  balance,
  sessionSpend,
}: {
  balance: number;
  sessionSpend: number;
}) {
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md px-4 py-2.5 flex items-center justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
          Balance
        </div>
        <div className="font-mono text-sm font-semibold text-slate-100">
          ${balance.toFixed(4)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
          Session Spend
        </div>
        <div className="font-mono text-sm font-semibold text-emerald-400">
          ${sessionSpend.toFixed(4)}
        </div>
      </div>
    </div>
  );
}
