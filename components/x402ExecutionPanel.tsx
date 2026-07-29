"use client";

/**
 * components/x402ExecutionPanel.tsx
 *
 * The Agent Execution Console, restyled as a cream `feature-card`. The
 * archetype picker uses the `category-tab` pattern (transparent → muted
 * text, active → surface-cream-strong background), the prompt field is a
 * `text-input`, and "Execute Agent" is the panel's one `button-primary` —
 * coral is spent here and nowhere else in the console, per DESIGN.md's
 * "coral is scarce on individual elements" rule.
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

export default function X402ExecutionPanel({
  onLog,
  onPayment,
  onSummary,
  className,
}: {
  onLog: (entry: LogEntry) => void;
  onPayment: (p: { amountUsdc: number; txHash: string; nodeId: string }) => void;
  onSummary: (s: { sessionSpend: number; remainingBalance: number }) => void;
  className?: string;
}) {
  const [archetype, setArchetype] = useState<AgentArchetype>("x402_aggregator");
  const [prompt, setPrompt] = useState(AGENT_ARCHETYPES.x402_aggregator.defaultPrompt);
  const [spendLimit, setSpendLimit] = useState(0.05);
  const [isRunning, setIsRunning] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<ExecutionStage | null>(null);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
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
    setCompletedNodes([]);
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
            if (parsed.stage === "delivered") {
              setCompletedNodes((prev) => [...prev, parsed.nodeId]);
            }
          } else if (eventType === "log") {
            onLog(JSON.parse(rawData) as LogEntry);
          } else if (eventType === "payment") {
            const parsed = JSON.parse(rawData) as {
              nodeId: string;
              amountUsdc: number;
              txHash: string;
            };
            onPayment(parsed);
            pushToast({
              id: `${parsed.nodeId}-${Date.now()}`,
              amountUsdc: parsed.amountUsdc,
              txHash: parsed.txHash,
            });
          } else if (eventType === "summary") {
            const parsed = JSON.parse(rawData) as {
              sessionSpend: number;
              remainingBalance: number;
            };
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
    <div className={cn("relative rounded-lg bg-surface-card p-4 sm:p-5", className)}>
      {/* Settlement toasts — cream card, success accent, no coral (reserved for the CTA) */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 shadow-[0_1px_3px_rgba(20,20,19,0.12)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <div className="font-mono text-[11px] leading-tight">
                <div className="text-body-strong">Settled ${t.amountUsdc.toFixed(4)} USDC</div>
                <div className="text-muted">
                  {t.txHash.slice(0, 8)}...{t.txHash.slice(-6)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-normal tracking-display-sm text-ink">
          x402 Execution Panel
        </h2>
      </div>

      {/* Archetype selector — category-tab pattern */}
      <label className="mb-1.5 block text-[11px] font-sans font-medium uppercase tracking-caption text-muted">
        Agent Archetype
      </label>
      <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {(Object.keys(AGENT_ARCHETYPES) as AgentArchetype[]).map((key) => (
          <button
            key={key}
            onClick={() => handleArchetypeChange(key)}
            disabled={isRunning}
            className={cn(
              "min-h-[44px] rounded-md px-2.5 py-1.5 text-left text-[12px] font-sans font-medium transition-colors disabled:opacity-40",
              archetype === key
                ? "bg-surface-cream-strong text-ink"
                : "text-muted hover:text-body-strong"
            )}
          >
            {AGENT_ARCHETYPES[key].label}
          </button>
        ))}
      </div>

      {/* Prompt — text-input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        disabled={isRunning}
        className="mb-3 w-full resize-none rounded-md border border-hairline bg-canvas p-3 font-mono text-[13px] text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 disabled:opacity-60"
      />

      {/* Spend limit slider */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-sans">
          <span className="font-medium uppercase tracking-caption text-muted">
            Per-Call Spend Limit
          </span>
          <span className="font-mono text-primary">${spendLimit.toFixed(4)} USDC</span>
        </div>
        <input
          type="range"
          min={0.0001}
          max={1}
          step={0.0001}
          value={spendLimit}
          onChange={(e) => setSpendLimit(Number(e.target.value))}
          disabled={isRunning}
          className="h-2 w-full min-h-[44px] cursor-pointer appearance-none rounded-pill bg-hairline accent-primary disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-soft">
          <span>$0.0001</span>
          <span>$1.00</span>
        </div>
      </div>

      {/* Execution workflow visualizer */}
      <div className="mb-4 space-y-1.5">
        {EXECUTION_STAGES.map((stage, idx) => {
          const isActive = activeStage === stage.key;
          const stageIdx = EXECUTION_STAGES.findIndex((s) => s.key === activeStage);
          const isPast = stageIdx > idx;

          return (
            <div
              key={stage.key}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                isActive ? "border-primary/40 bg-primary/5" : "border-hairline-soft bg-transparent"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                  isActive
                    ? "border-primary text-primary"
                    : isPast
                    ? "border-success bg-success/10 text-success"
                    : "border-hairline text-muted-soft"
                )}
              >
                {isActive ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isPast ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  idx + 1
                )}
              </span>
              <span
                className={cn(
                  "font-sans text-[12px]",
                  isActive ? "text-body-strong font-medium" : isPast ? "text-body" : "text-muted-soft"
                )}
              >
                {stage.label}
              </span>
              {isActive && activeNode && (
                <span className="ml-auto font-mono text-[10px] text-muted truncate">{activeNode}</span>
              )}
            </div>
          );
        })}
      </div>

      {runError && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-error/30 bg-error/10 px-2.5 py-2 text-[12px] font-sans text-error">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {runError}
        </div>
      )}

      <button
        onClick={execute}
        disabled={isRunning || !prompt.trim()}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-primary font-sans text-sm font-medium text-on-primary transition-colors hover:bg-primary-active disabled:bg-primary-disabled disabled:text-muted disabled:cursor-not-allowed"
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
