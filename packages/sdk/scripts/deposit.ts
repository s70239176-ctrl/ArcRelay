/**
 * scripts/deposit.ts
 *
 * Deposits USDC from the wallet's regular balance into its Circle Gateway
 * Wallet balance — a one-time (or top-up) on-chain step required before
 * `ArcRelayClient.pay()` can settle anything. Faucet USDC sits in your
 * plain wallet balance first; Gateway needs it moved into the Gateway
 * Wallet contract before it can be spent via x402.
 *
 * Run with:
 *   ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/deposit.ts 1.00
 */
import { ArcRelayClient } from "../src/index.js";

const privateKey = process.env.ARCRELAY_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("Set ARCRELAY_PRIVATE_KEY first.");
  process.exit(1);
}

const amount = process.argv[2] ?? "1.00";

const client = new ArcRelayClient({ privateKey, chain: "arcTestnet" });

console.log(`Depositing ${amount} USDC into the Gateway Wallet for ${client.address}...`);
console.log("(this is an on-chain transaction — it will take a moment to confirm)");

await client.deposit(amount);

console.log("Deposit confirmed.");

const balance = await client.getBalance();
console.log("Wallet USDC balance after deposit:", balance.formatted);
