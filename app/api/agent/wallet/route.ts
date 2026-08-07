/**
 * app/api/agent/wallet/route.ts
 *
 * Exposes the orchestrator's wallet + Gateway balance breakdown to the
 * frontend, so the dashboard reflects real state in live mode instead of
 * only ever showing client-simulated numbers. See
 * `lib/circle-agent-wallet.ts`'s `getDetailedBalances` for what
 * `wallet` vs `gateway.available` actually mean — the distinction real
 * testnet-USDC testing surfaced matters for correctly reading this data.
 */

import { NextResponse } from "next/server";
import { getOrCreateAgentWallet, getDetailedBalances, WALLET_MODE } from "@/lib/circle-agent-wallet";

export async function GET() {
  try {
    const wallet = await getOrCreateAgentWallet();
    const balances = await getDetailedBalances(wallet);
    return NextResponse.json(balances);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch wallet balances.",
        mode: WALLET_MODE,
      },
      { status: 500 }
    );
  }
}
