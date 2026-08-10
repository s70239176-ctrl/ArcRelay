"use client";

/**
 * components/SettlementTicker.tsx
 *
 * The page's signature element and hero, per the design brief: real
 * settlement events scrolling right-to-left like a stock ticker /
 * departures board, in large tabular monospace. This is the first
 * characteristic thing shown — ArcRelay's actual value (real-time
 * machine-to-machine settlement) made visible immediately, not described.
 *
 * Duplicates the item list once so the CSS marquee (`translateX(-50%)`
 * over the doubled-width track) loops seamlessly with no visible seam.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PaymentEvent } from "@/components/ArcRelayDashboard";

export default function SettlementTicker({ payments }: { payments: PaymentEvent[] }) {
  const items = useMemo(() => payments.slice(0, 24), [payments]);
  const isEmpty = items.length === 0;

  const track = isEmpty ? PLACEHOLDER_ITEMS : items;

  return (
    <div className="relative overflow-hidden border-b border-hairline bg-surface-sunken">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface-sunken to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface-sunken to-transparent"
        aria-hidden
      />

      <div
        className={cn("flex w-max items-stretch", !isEmpty && "animate-ticker")}
        style={{ animationDuration: `${Math.max(track.length * 3.2, 18)}s` }}
      >
        {/* Render the track twice back-to-back so the -50% loop is seamless. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-stretch" aria-hidden={copy === 1}>
            {track.map((item, i) => (
              <TickerItem key={`${copy}-${item.id ?? i}`} item={item} placeholder={isEmpty} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TickerItem({
  item,
  placeholder,
}: {
  item: PaymentEvent | (typeof PLACEHOLDER_ITEMS)[number];
  placeholder: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-r border-hairline px-5 py-3">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", placeholder ? "bg-muted" : "bg-gold")} />
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{item.label}</span>
      <span className="font-mono text-lg font-medium tabular text-ink">
        ${item.amountUsdc.toFixed(4)}
      </span>
      <span className="font-mono text-[11px] text-muted">USDC</span>
      {"txHash" in item && item.txHash && (
        <span className="font-mono text-[11px] text-body">
          {item.txHash.slice(0, 6)}…{item.txHash.slice(-4)}
        </span>
      )}
    </div>
  );
}

const PLACEHOLDER_ITEMS = [
  { id: "ph-1", label: "Awaiting settlement", amountUsdc: 0, txHash: "" },
  { id: "ph-2", label: "Execute an agent to see live payments here", amountUsdc: 0, txHash: "" },
];
