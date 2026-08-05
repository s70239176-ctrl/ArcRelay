/**
 * src/example.ts
 *
 * A self-contained demonstration of both halves of @arcrelay/sdk working
 * together: an Express route protected by `x402Middleware` (seller side)
 * and an `ArcRelayClient`-backed LangChain tool paying for it (buyer side)
 * — no dependency on the ArcRelay app itself.
 *
 * Note: this intentionally does NOT point at ArcRelay's own
 * `/api/v1/mock-nodes/*` routes. Those use a simplified, network-free JSON
 * 402 challenge in mock mode (see the root repo's README), which is not
 * wire-compatible with the real x402 header-based challenge
 * `ArcRelayClient`/`GatewayClient` speak. `x402Middleware` below emits a
 * genuine x402 challenge, so this demo is protocol-correct end to end —
 * completing an actual payment still needs a funded key and network access
 * to Circle's Gateway API (see the root README's "Going live" section).
 *
 * Run with:
 *   AGENT_PRIVATE_KEY=0x... npx tsx src/example.ts
 */

import express from "express";
import type { Server } from "node:http";
import { x402Middleware, ARC_NETWORKS } from "@arcrelay/sdk";
import { createX402PayTool } from "./x402PayTool.js";

function startDemoSellerServer(): Promise<{ server: Server; url: string }> {
  const app = express();
  app.get(
    "/premium-data",
    x402Middleware({
      price: "0.001",
      sellerAddress: "0x9E4c1F3aA7d02B6e8C5f10D4b3A9e7C2F1a8B6D5",
      network: ARC_NETWORKS.testnet,
      description: "Example premium dataset",
    }),
    (_req, res) => res.json({ data: "here is your premium payload" })
  );

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/premium-data` });
    });
  });
}

async function directToolDemo() {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  const { server, url } = await startDemoSellerServer();
  console.log(`Demo seller route live at ${url} (protected by x402Middleware)`);

  if (!privateKey) {
    console.log("\nSet AGENT_PRIVATE_KEY to run this demo against a real (funded) Arc testnet wallet.");
    console.log("Showing the tool's shape instead:\n");
    // Hardhat's well-known default test account #0 private key — public,
    // funds-free, valid as an EC scalar (unlike an all-zero key) — used
    // only to construct the tool object for inspection, never to pay.
    const DEMO_ONLY_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
    const tool = createX402PayTool({ privateKey: DEMO_ONLY_KEY });
    console.log({ name: tool.name, description: tool.description });
    server.close();
    return;
  }

  const payTool = createX402PayTool({
    privateKey,
    chain: "arcTestnet",
    maxPerPaymentUsdc: 0.01,
    maxSessionUsdc: 0.5,
  });

  console.log(`\nTool "${payTool.name}" ready. Paying for the demo route...`);

  try {
    const resultJson = await payTool.invoke({ url, method: "GET" });
    console.log("Result:", resultJson);
  } finally {
    server.close();
  }
}

/**
 * Full agent wiring (illustrative — requires `@langchain/openai` and a real
 * OPENAI_API_KEY, so it's not invoked by default):
 *
 *   import { ChatOpenAI } from "@langchain/openai";
 *   import { createReactAgent } from "langchain/agents";
 *
 *   const payTool = createX402PayTool({ privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}` });
 *   const agent = createReactAgent({
 *     llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
 *     tools: [payTool],
 *   });
 *
 *   const result = await agent.invoke({
 *     messages: [
 *       { role: "user", content: "Pay for sentiment data at http://localhost:3000/api/v1/mock-nodes/sentiment_node and summarize it." },
 *     ],
 *   });
 *   console.log(result);
 */

directToolDemo().catch((err) => {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
