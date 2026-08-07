/**
 * scripts/check-balances-detailed.ts
 *
 * Shows the full breakdown `GatewayClient.getBalances()` exposes: plain
 * wallet USDC vs. Gateway balance (total/available/withdrawing/withdrawable).
 * Useful right after `pay-demo.ts` to confirm a payment was debited from
 * your Gateway `available` balance immediately, even before the batched
 * on-chain settlement transaction to the seller has landed.
 *
 * Run with:
 *   ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/check-balances-detailed.ts
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const privateKey = process.env.ARCRELAY_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("Set ARCRELAY_PRIVATE_KEY first.");
  process.exit(1);
}

const client = new GatewayClient({ chain: "arcTestnet", privateKey });

console.log("Wallet address:", client.address);

const balances = await client.getBalances();

console.log("\nPlain wallet USDC balance:", balances.wallet.formatted);
console.log("\nGateway balance:");
console.log("  total:       ", balances.gateway.formattedTotal);
console.log("  available:   ", balances.gateway.formattedAvailable, "(spendable via x402 right now)");
console.log("  withdrawing: ", balances.gateway.formattedWithdrawing);
console.log("  withdrawable:", balances.gateway.formattedWithdrawable);
