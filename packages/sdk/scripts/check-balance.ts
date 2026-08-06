/**
 * scripts/check-balance.ts
 *
 * Prints the ArcRelayClient wallet's address and USDC balance on Arc L1
 * testnet. Run with:
 *
 *   ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/check-balance.ts
 */
import { ArcRelayClient } from "../src/index.js";

const privateKey = process.env.ARCRELAY_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("Set ARCRELAY_PRIVATE_KEY first.");
  process.exit(1);
}

const client = new ArcRelayClient({ privateKey, chain: "arcTestnet" });

console.log("Wallet address:", client.address);

const balance = await client.getBalance();
console.log("USDC wallet balance:", balance.formatted);
