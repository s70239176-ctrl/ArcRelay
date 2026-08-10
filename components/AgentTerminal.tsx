"use client";

/**
 * components/AgentTerminal.tsx
 *
 * The relayer log terminal — a real terminal treatment: sunken surface
 * (darker than the surrounding panels), the shared `.terminal-texture`
 * scanline/vignette (see app/globals.css), a live blinking cursor, and
 * category filters. Status badges use cyan/violet/success/error, keeping
 * gold reserved for settlement/value elsewhere in the app.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, ScrollText, ShieldAlert, Radio } from "lucide-react";
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
  "402_CHALLENGE": "bg-violet/15 border-violet/40 text-violet",
  "200_OK": "bg-success/15 border-success/40 text-success",
  RELAY_SUBMITTED: "bg-cyan/15 border-cyan/40 text-cyan",
  GATEWAY_BATCHED: "bg-cyan/10 border-cyan/30 text-cyan",
  ERROR: "bg-error/15 border-error/40 text-error",
};

const DOT_STYLES: Record<LogCategory, string> = {
  x402: "bg-violet",
  gateway: "bg-cyan",
  relayer: "bg-success",
  error: "bg-error",
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
    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const copyPayload = async (entry: LogEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry.payload, null, 2));
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1400);
    } catch {
      // Clipboard API unavailable — fail silently, JSON is still visible.
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
        "terminal-texture flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface-sunken",
        className
      )}
    >
      <div className="relative z-[2] flex items-center gap-2 border-b border-hairline px-4 py-3">
        <ScrollText className="h-4 w-4 text-cyan" />
        <span className="font-mono text-xs font-medium text-ink">Relayer Log Terminal</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-success">
          <Radio className="h-3 w-3 animate-pulse" />
          live
        </span>
      </div>

      <div className="relative z-[2] flex gap-1 overflow-x-auto scrollbar-none border-b border-hairline px-2.5 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 min-h-[36px] rounded-md px-2.5 text-[11px] font-sans font-medium transition-colors whitespace-nowrap",
              filter === f.key ? "bg-surface-elevated text-ink" : "text-muted hover:text-body"
            )}
          >
            {f.label}
            <span className="ml-1.5 text-muted/70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-[2] flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1.5 min-h-[240px] max-h-[460px]"
      >
        {filtered.length === 0 && (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs font-sans text-muted">
              No log entries for this filter yet. Execute an agent to start streaming telemetry.
            </p>
            <span className="font-mono text-sm text-muted">
              <span className="text-cyan">$</span> awaiting input
              <span className="ml-0.5 inline-block h-3.5 w-2 translate-y-0.5 bg-cyan/80 animate-blink" />
            </span>
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
                className="rounded-md bg-surface"
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : entry.id)}
                  className="flex w-full min-h-[44px] items-center gap-2 px-2.5 py-2 text-left"
                >
                  {entry.category === "error" ? (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-error" />
                  ) : (
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_STYLES[entry.category])} />
                  )}
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium",
                      STATUS_STYLES[entry.status]
                    )}
                  >
                    {entry.status}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular text-muted hidden sm:inline">
                    {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-body">
                    <span className="text-muted">{entry.nodeLabel}</span> — {entry.message}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
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
                      className="overflow-hidden border-t border-hairline"
                    >
                      <div className="relative px-2.5 py-2">
                        <button
                          onClick={() => copyPayload(entry)}
                          className="absolute right-2 top-2 flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md bg-surface-elevated text-muted hover:text-ink"
                          aria-label="Copy payload to clipboard"
                        >
                          {copiedId === entry.id ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <pre className="max-h-56 overflow-auto rounded bg-surface-sunken p-2.5 pr-10 font-mono text-[11px] leading-relaxed text-muted">
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
