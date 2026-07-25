"use client";

/**
 * components/x402ExecutionPanel.tsx
 *
 * Interactive execution card for the Agent Execution Console. Lets the
 * operator pick an agent archetype, set a per-call spend ceiling, and
 * trigger a live x402 nanopayment run. Drives the orchestrator SSE route,
 * surfaces a step-by-step execution workflow visualizer, and reports
 * structured log/payment/telemetry events up to the dashboard shell.
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
    <div
      className={cn(
        "relative rounded-lg border border-[#1F2232] bg-[#0D0E15] p-3 sm:p-4",
        className
      )}
    >
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
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
              <div className="font-mono text-[11px] leading-tight">
                <div className="text-[#6ee7b7]">
                  Settled ${t.amountUsdc.toFixed(4)} USDC
                </div>
                <div className="text-slate-500">
                  {t.txHash.slice(0, 8)}...{t.txHash.slice(-6)}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-[#00F0FF]" />
        <h2 className="font-mono text-sm font-medium text-slate-200">
          x402 Execution Panel
        </h2>
      </div>

      {/* Archetype selector */}
      <label className="mb-1 block text-[11px] font-mono uppercase tracking-wider text-slate-500">
        Agent Archetype
      </label>
      <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {(Object.keys(AGENT_ARCHETYPES) as AgentArchetype[]).map((key) => (
          <button
            key={key}
            onClick={() => handleArchetypeChange(key)}
            disabled={isRunning}
            className={cn(
              "min-h-[44px] rounded-md border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors disabled:opacity-40",
              archetype === key
                ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/10 text-[#c4b5fd]"
                : "border-[#1F2232] text-slate-400 hover:border-[#1F2232]/80 hover:text-slate-200"
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
        className="mb-3 w-full resize-none rounded-md border border-[#1F2232] bg-[#07080C] p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#00F0FF]/30 disabled:opacity-60"
      />

      {/* Spend limit slider */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono">
          <span className="uppercase tracking-wider text-slate-500">
            Per-Call Spend Limit
          </span>
          <span className="text-[#00F0FF]">${spendLimit.toFixed(4)} USDC</span>
        </div>
        <input
          type="range"
          min={0.0001}
          max={1}
          step={0.0001}
          value={spendLimit}
          onChange={(e) => setSpendLimit(Number(e.target.value))}
          disabled={isRunning}
          className="h-2 w-full min-h-[44px] cursor-pointer appearance-none rounded-full bg-[#1F2232] accent-[#00F0FF] disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-600">
          <span>$0.0001</span>
          <span>$1.00</span>
        </div>
      </div>

      {/* Execution workflow visualizer */}
      <div className="mb-4 space-y-1.5">
        {EXECUTION_STAGES.map((stage, idx) => {
          const isActive = activeStage === stage.key;
          const stageIdx = EXECUTION_STAGES.findIndex((s) => s.key === activeStage);
          const isDone =
            !isRunning && completedNodes.length > 0
              ? true
              : stageIdx > idx || (stageIdx === idx && !isActive);
          const isPast = stageIdx > idx;

          return (
            <div
              key={stage.key}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                isActive
                  ? "border-[#00F0FF]/40 bg-[#00F0FF]/5"
                  : isPast
                  ? "border-[#1F2232] bg-transparent"
                  : "border-[#1F2232]/60 bg-transparent"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                  isActive
                    ? "border-[#00F0FF] text-[#00F0FF]"
                    : isPast
                    ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
                    : "border-[#1F2232] text-slate-600"
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
                  "font-mono text-[11px]",
                  isActive ? "text-[#67e8f9]" : isPast ? "text-slate-400" : "text-slate-600"
                )}
              >
                {stage.label}
              </span>
              {isActive && activeNode && (
                <span className="ml-auto font-mono text-[10px] text-slate-500 truncate">
                  {activeNode}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {runError && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] font-mono text-red-300">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {runError}
        </div>
      )}

      <button
        onClick={execute}
        disabled={isRunning || !prompt.trim()}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#00F0FF] font-mono text-sm font-semibold text-[#07080C] shadow-[0_0_15px_rgba(0,240,255,0.25)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
