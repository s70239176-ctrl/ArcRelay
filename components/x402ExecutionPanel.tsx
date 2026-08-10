"use client";

/**
 * components/x402ExecutionPanel.tsx
 *
 * The Agent Execution Console. The 5-stage x402 flow is rendered as a
 * circuit rail — nodes connected by a line, with a pulse animation
 * traveling along the active segment — rather than a plain vertical
 * checklist, since the subject (payment routing through a settlement
 * network) is literally about something moving through a circuit. Gold
 * is spent on exactly one control here: "Execute Agent."
 */

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Sliders, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AGENT_ARCHETYPES,
  EXECUTION_STAGES,
  type AgentArchetype,
  type ExecutionStage,
  type LogEntry,
} from "@/lib/agent-types";

interface SettlementToast {
  id: string;
  amountUsdc: number;
  txHash: string;
}

interface PaymentPayload {
  nodeId: string;
  label: string;
  capability: string;
  amountUsdc: number;
  chain: string;
  txHash: string;
  latencyMs: number;
}

export default function X402ExecutionPanel({
  onLog,
  onPayment,
  onSummary,
  className,
}: {
  onLog: (entry: LogEntry) => void;
  onPayment: (p: PaymentPayload) => void;
  onSummary: (s: { sessionSpend: number; remainingBalance: number }) => void;
  className?: string;
}) {
  const [archetype, setArchetype] = useState<AgentArchetype>("x402_aggregator");
  const [prompt, setPrompt] = useState(AGENT_ARCHETYPES.x402_aggregator.defaultPrompt);
  const [spendLimit, setSpendLimit] = useState(0.05);
  const [isRunning, setIsRunning] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<ExecutionStage | null>(null);
  const [toasts, setToasts] = useState<SettlementToast[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const pushToast = useCallback((toast: SettlementToast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 3200);
  }, []);

  const handleArchetypeChange = (next: AgentArchetype) => {
    setArchetype(next);
    setPrompt(AGENT_ARCHETYPES[next].defaultPrompt);
  };

  const execute = useCallback(async () => {
    if (isRunning || !prompt.trim()) return;

    setIsRunning(true);
    setRunError(null);
    setActiveStage(null);
    setActiveNode(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, spendLimitUsdc: spendLimit }),
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

          if (eventType === "step") {
            const parsed = JSON.parse(rawData) as { stage: ExecutionStage; nodeId: string };
            setActiveNode(parsed.nodeId);
            setActiveStage(parsed.stage);
          } else if (eventType === "log") {
            onLog(JSON.parse(rawData) as LogEntry);
          } else if (eventType === "payment") {
            const parsed = JSON.parse(rawData) as PaymentPayload & { type: string };
            onPayment(parsed);
            pushToast({
              id: `${parsed.nodeId}-${Date.now()}`,
              amountUsdc: parsed.amountUsdc,
              txHash: parsed.txHash,
            });
          } else if (eventType === "summary") {
            const parsed = JSON.parse(rawData) as { sessionSpend: number; remainingBalance: number };
            onSummary(parsed);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setRunError(err instanceof Error ? err.message : "Execution failed.");
      }
    } finally {
      setIsRunning(false);
      setActiveStage(null);
      setActiveNode(null);
      abortRef.current = null;
    }
  }, [isRunning, prompt, spendLimit, onLog, onPayment, onSummary, pushToast]);

  return (
    <div className={cn("relative rounded-lg border border-hairline bg-surface p-4 sm:p-5", className)}>
      {/* Settlement toasts */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-hairline-strong bg-surface-elevated px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <div className="font-mono text-[11px] leading-tight">
                <div className="tabular text-ink">Settled ${t.amountUsdc.toFixed(4)} USDC</div>
                <div className="text-muted">
                  {t.txHash.slice(0, 8)}...{t.txHash.slice(-6)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-gold" />
        <h2 className="font-mono text-base font-semibold text-ink">x402 Execution Panel</h2>
      </div>

      {/* Archetype selector */}
      <label className="mb-1.5 block text-[11px] font-sans font-medium uppercase tracking-wide text-muted">
        Agent Archetype
      </label>
      <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {(Object.keys(AGENT_ARCHETYPES) as AgentArchetype[]).map((key) => (
          <button
            key={key}
            onClick={() => handleArchetypeChange(key)}
            disabled={isRunning}
            className={cn(
              "min-h-[44px] rounded-md border px-2.5 py-1.5 text-left text-[12px] font-sans font-medium transition-colors disabled:opacity-40",
              archetype === key
                ? "border-gold/30 bg-gold-dim text-ink"
                : "border-hairline text-muted hover:border-hairline-strong hover:text-body"
            )}
          >
            {AGENT_ARCHETYPES[key].label}
          </button>
        ))}
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={isRunning}
        className="mb-3 w-full resize-none rounded-md border border-hairline bg-surface-sunken p-3 font-mono text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold/25 focus:border-gold/50 disabled:opacity-60"
      />

      {/* Spend limit slider */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-sans">
          <span className="font-medium uppercase tracking-wide text-muted">Per-Call Spend Limit</span>
          <span className="font-mono tabular text-gold">${spendLimit.toFixed(4)} USDC</span>
        </div>
        <input
          type="range"
          min={0.0001}
          max={1}
          step={0.0001}
          value={spendLimit}
          onChange={(e) => setSpendLimit(Number(e.target.value))}
          disabled={isRunning}
          className="h-2 w-full min-h-[44px] cursor-pointer appearance-none rounded-full bg-hairline accent-gold disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>$0.0001</span>
          <span>$1.00</span>
        </div>
      </div>

      {/* Circuit-rail execution visualizer */}
      <CircuitRail activeStage={activeStage} activeNode={activeNode} />

      {runError && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-error/30 bg-error/10 px-2.5 py-2 text-[12px] font-sans text-error">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {runError}
        </div>
      )}

      <button
        onClick={execute}
        disabled={isRunning || !prompt.trim()}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-gold font-sans text-sm font-semibold text-canvas transition-colors hover:bg-gold/90 disabled:bg-hairline disabled:text-muted disabled:cursor-not-allowed"
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Executing…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" /> Execute Agent
          </>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Circuit rail — 5 stage nodes connected by a line, with a pulse traveling
// along the currently-active segment.
// ---------------------------------------------------------------------------

function CircuitRail({
  activeStage,
  activeNode,
}: {
  activeStage: ExecutionStage | null;
  activeNode: string | null;
}) {
  const activeIdx = activeStage ? EXECUTION_STAGES.findIndex((s) => s.key === activeStage) : -1;

  return (
    <div className="mb-4 rounded-md border border-hairline bg-surface-sunken p-3">
      <div className="relative flex items-center">
        {EXECUTION_STAGES.map((stage, idx) => {
          const isActive = idx === activeIdx;
          const isPast = activeIdx > idx;
          const isLast = idx === EXECUTION_STAGES.length - 1;

          return (
            <div key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="group relative flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors",
                    isActive
                      ? "border-gold bg-gold text-canvas"
                      : isPast
                      ? "border-success/60 bg-success/10 text-success"
                      : "border-hairline-strong text-muted"
                  )}
                >
                  {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    "absolute top-8 w-24 text-center font-mono text-[9px] leading-tight transition-opacity",
                    isActive ? "text-gold opacity-100" : "text-muted opacity-0 group-hover:opacity-100"
                  )}
                >
                  {stage.label.split(" ").slice(0, 3).join(" ")}
                </span>
              </div>

              {!isLast && (
                <div className="relative mx-1 h-px flex-1 bg-hairline-strong">
                  {isPast && <div className="absolute inset-0 bg-success/60" />}
                  {isActive && (
                    <div className="absolute inset-y-0 left-0 w-2 -translate-y-1/2 top-1/2">
                      <div className="absolute h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_2px_rgba(232,177,74,0.6)] animate-pulse-travel" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[11px]">
        <span className={cn(activeStage ? "text-body" : "text-muted")}>
          {activeStage ? EXECUTION_STAGES[activeIdx].label : "Idle — awaiting execution"}
        </span>
        {activeNode && <span className="text-muted">{activeNode}</span>}
      </div>
    </div>
  );
}
