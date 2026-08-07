/**
 * scripts/pay-demo.ts
 *
 * The real thing: a live Express route protected by `x402Middleware`, paid
 * by a real `ArcRelayClient` using real testnet USDC, settled via Circle
 * Gateway on Arc L1 — then polls the seller's actual on-chain USDC balance
 * (a plain ERC-20 `balanceOf` read, independent of anything ArcRelay's SDK
 * reports) to prove funds genuinely moved, not just that an API call
 * returned success.
 *
 * Gateway settlement is *batched* — `pay()` resolving successfully means
 * the payment was verified and accepted, not necessarily that the on-chain
 * transfer has landed yet. This script polls for up to ~60s so you can
 * watch the seller's balance actually tick up in real time.
 *
 * Run with:
 *   ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/pay-demo.ts [priceUsdc] [sellerAddress]
 *
 * If sellerAddress is omitted, a fresh throwaway address is generated so
 * you can watch its balance go from 0 -> something, which is the clearest
 * possible proof this isn't just talking to itself.
 */
import express from "express";
import { createPublicClient, http, defineChain } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { x402Middleware, ArcRelayClient, ARC_NETWORKS } from "../src/index.js";

const privateKey = process.env.ARCRELAY_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) {
  console.error("Set ARCRELAY_PRIVATE_KEY first (your funded, Gateway-deposited wallet).");
  process.exit(1);
}

const priceUsdc = process.argv[2] ?? "0.01";
const sellerAddress = (process.argv[3] as `0x${string}` | undefined) ?? privateKeyToAddress(generatePrivateKey());

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";

const arcTestnetChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  testnet: true,
});

const publicClient = createPublicClient({ chain: arcTestnetChain, transport: http() });

const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function getUsdcBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: ARC_USDC_ADDRESS,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

function formatUsdc(atomic: bigint): string {
  return (Number(atomic) / 1_000_000).toFixed(6);
}

async function main(privateKey: `0x${string}`) {
  console.log(`Seller address: ${sellerAddress}`);
  const sellerBalanceBefore = await getUsdcBalance(sellerAddress);
  console.log(`Seller USDC balance before: ${formatUsdc(sellerBalanceBefore)}`);

  const app = express();
  app.get(
    "/premium-data",
    x402Middleware({
      price: priceUsdc,
      sellerAddress,
      network: ARC_NETWORKS.testnet,
      description: "ArcRelay real-money test payment",
    }),
    (_req, res) => res.json({ data: "paid content delivered for real" })
  );

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/premium-data`;
  console.log(`\nDemo seller route live at ${url} (protected by x402Middleware, price $${priceUsdc})`);

  const buyer = new ArcRelayClient({ privateKey, chain: "arcTestnet" });
  const buyerBalanceBefore = await buyer.getBalance();
  console.log(`Buyer address: ${buyer.address}`);
  console.log(`Buyer USDC wallet balance before: ${buyerBalanceBefore.formatted}`);

  console.log(`\nPaying $${priceUsdc} USDC for ${url}...`);
  const result = await buyer.pay(url, { method: "GET" });
  console.log(`Payment call succeeded: paid $${result.amountUsdc.toFixed(6)} USDC, tx ${result.txHash}`);
  console.log(`Response payload:`, result.data);

  server.close();

  console.log(`\nPolling seller's real on-chain USDC balance (Gateway settlement is batched, so this can take a bit)...`);
  const deadline = Date.now() + 60_000;
  let sellerBalanceAfter = sellerBalanceBefore;
  while (Date.now() < deadline) {
    sellerBalanceAfter = await getUsdcBalance(sellerAddress);
    if (sellerBalanceAfter > sellerBalanceBefore) break;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log();

  console.log(`Seller USDC balance after:  ${formatUsdc(sellerBalanceAfter)}`);
  console.log(`Seller USDC balance delta:  +${formatUsdc(sellerBalanceAfter - sellerBalanceBefore)}`);

  if (sellerBalanceAfter > sellerBalanceBefore) {
    console.log(`\n✅ Confirmed: real USDC moved on-chain from buyer to seller via Circle Gateway on Arc L1 testnet.`);
    console.log(`   Explorer (seller address): https://testnet.arcscan.app/address/${sellerAddress}`);
  } else {
    console.log(
      `\n⚠️  Seller balance hasn't updated within 60s. The payment call itself succeeded (see tx above), ` +
        `so this is most likely just batching latency — check the explorer link in a minute or two:`
    );
    console.log(`   https://testnet.arcscan.app/address/${sellerAddress}`);
  }
}

main(privateKey).catch((err) => {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
