"use client";

/**
 * components/SettlementLedger.tsx
 *
 * A persistent, ledger-styled list of settled payments — distinct from the
 * raw execution log in AgentTerminal. Right-aligned tabular amounts, a
 * gold tick-flash on the row that just arrived (the `animate-tick-flash`
 * keyframe defined in tailwind.config.ts), and running totals footer.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Receipt } from "lucide-react";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import type { PaymentEvent } from "@/components/ArcRelayDashboard";

export default function SettlementLedger({ payments }: { payments: PaymentEvent[] }) {
  const total = payments.reduce((sum, p) => sum + p.amountUsdc, 0);
  const animatedTotal = useAnimatedNumber(total, 500);
  const mostRecentId = payments[0]?.id;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <Receipt className="h-3.5 w-3.5 text-gold" />
        <span className="font-sans text-xs font-medium text-ink">Settlement Ledger</span>
        <span className="ml-auto font-mono text-[11px] tabular text-muted">
          {payments.length} settled
        </span>
      </div>

      <div className="max-h-[220px] min-h-[96px] overflow-y-auto">
        {payments.length === 0 ? (
          <div className="flex h-24 items-center justify-center px-4 text-center">
            <p className="font-mono text-[12px] text-muted">
              No settlements yet — execute an agent to populate the ledger.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {payments.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.2 }}
                className={
                  p.id === mostRecentId ? "animate-tick-flash" : undefined
                }
              >
                <div className="flex items-center gap-3 border-b border-hairline/60 px-4 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-body">
                    {p.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {p.txHash.slice(0, 6)}…{p.txHash.slice(-4)}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-medium tabular text-gold">
                    ${p.amountUsdc.toFixed(4)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-hairline px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Session total
        </span>
        <span className="font-mono text-[13px] font-medium tabular text-ink">
          ${animatedTotal.toFixed(4)} USDC
        </span>
      </div>
    </div>
  );
}
