"use client";

/**
 * components/AgentTerminal.tsx
 *
 * High-performance streaming log terminal. Renders a live, auto-scrolling
 * feed of structured LogEntry records with color-coded status badges,
 * category filters, and an expandable JSON payload inspector with
 * copy-to-clipboard.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Copy,
  ScrollText,
  ShieldAlert,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogCategory, LogEntry, LogStatus } from "@/lib/agent-types";

type FilterKey = "all" | LogCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "x402", label: "x402 Requests" },
  { key: "gateway", label: "Gateway Batches" },
  { key: "relayer", label: "Relayer Executions" },
  { key: "error", label: "Errors" },
];

const STATUS_STYLES: Record<LogStatus, string> = {
  "402_CHALLENGE": "bg-[#8B5CF6]/10 border-[#8B5CF6]/40 text-[#c4b5fd]",
  "200_OK": "bg-[#10B981]/10 border-[#10B981]/40 text-[#6ee7b7]",
  RELAY_SUBMITTED: "bg-[#00F0FF]/10 border-[#00F0FF]/40 text-[#67e8f9]",
  GATEWAY_BATCHED: "bg-[#00F0FF]/10 border-[#00F0FF]/30 text-[#a5f3fc]",
  ERROR: "bg-red-500/10 border-red-500/40 text-red-300",
};

export default function AgentTerminal({
  logs,
  className,
}: {
  logs: LogEntry[];
  className?: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.category === filter)),
    [logs, filter]
  );

  useEffect(() => {
    if (shouldStickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const copyPayload = async (entry: LogEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry.payload, null, 2));
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1400);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently,
      // the JSON is still visible and selectable in the inspector.
    }
  };

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: logs.length, x402: 0, gateway: 0, relayer: 0, error: 0 };
    for (const l of logs) c[l.category] += 1;
    return c;
  }, [logs]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-[#1F2232] bg-[#0D0E15] overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-[#1F2232] px-3 py-2.5">
        <ScrollText className="h-4 w-4 text-[#00F0FF]" />
        <span className="font-mono text-xs font-medium text-slate-300">
          Relayer Log Terminal
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-[#10B981]">
          <Radio className="h-3 w-3 animate-pulse" />
          live
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-[#1F2232] px-2 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 min-h-[36px] rounded-md border px-2.5 text-[11px] font-mono transition-colors whitespace-nowrap",
              filter === f.key
                ? "border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#67e8f9]"
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {f.label}
            <span className="ml-1.5 text-slate-600">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-[240px] max-h-[460px]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {filtered.length === 0 && (
          <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center">
            <p className="text-xs font-mono text-slate-600">
              No log entries for this filter yet. Execute an agent to start
              streaming telemetry.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {filtered.map((entry) => {
            const isOpen = expandedId === entry.id;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-md border border-[#1F2232] bg-[#090A0F]"
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : entry.id)}
                  className="flex w-full min-h-[44px] items-center gap-2 px-2.5 py-2 text-left"
                >
                  {entry.category === "error" ? (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  ) : (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        entry.category === "x402" && "bg-[#8B5CF6]",
                        entry.category === "gateway" && "bg-[#00F0FF]",
                        entry.category === "relayer" && "bg-[#10B981]"
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium",
                      STATUS_STYLES[entry.status]
                    )}
                  >
                    {entry.status}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 hidden sm:inline">
                    {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                      hour12: false,
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">
                    <span className="text-slate-500">{entry.nodeLabel}</span>{" "}
                    — {entry.message}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-[#1F2232]"
                    >
                      <div className="relative px-2.5 py-2">
                        <button
                          onClick={() => copyPayload(entry)}
                          className="absolute right-2 top-2 flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md border border-[#1F2232] bg-[#0D0E15] text-slate-500 hover:text-slate-200"
                          aria-label="Copy payload to clipboard"
                        >
                          {copiedId === entry.id ? (
                            <Check className="h-3.5 w-3.5 text-[#10B981]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <pre className="max-h-56 overflow-auto rounded bg-black/40 p-2.5 pr-10 font-mono text-[11px] leading-relaxed text-slate-400">
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
