/**
 * src/example.ts
 *
 * Exercises the x402PayAction end to end against a real x402Middleware
 * route, using a minimal stub `IAgentRuntime` — no full ElizaOS agent
 * runtime required to verify the plugin's own logic. Same protocol-only
 * caveat as the LangChain adapter's example: completing an actual payment
 * needs a funded key + network access to Circle's Gateway API.
 *
 * Run with:
 *   ARCRELAY_PRIVATE_KEY=0x... npx tsx src/example.ts
 */

import express from "express";
import type { Server } from "node:http";
import { x402Middleware, ARC_NETWORKS } from "@arcrelay/sdk";
import { x402PayAction } from "./x402PayAction.js";
import type { IAgentRuntime, Memory } from "@elizaos/core";

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

// Minimal stub satisfying only the surface x402PayAction actually reads —
// not a full IAgentRuntime implementation.
function makeStubRuntime(settings: Record<string, string>): IAgentRuntime {
  return {
    getSetting: (key: string) => settings[key] ?? null,
  } as unknown as IAgentRuntime;
}

async function main() {
  const { server, url } = await startDemoSellerServer();
  console.log(`Demo seller route live at ${url} (protected by x402Middleware)`);

  const privateKey = process.env.ARCRELAY_PRIVATE_KEY;
  const runtime = makeStubRuntime(
    privateKey
      ? { ARCRELAY_PRIVATE_KEY: privateKey }
      : {
          // Hardhat's well-known default test account #0 — public,
          // funds-free — used only so `validate`/param-extraction can be
          // demonstrated without real funds.
          ARCRELAY_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        }
  );

  const message = {
    content: { text: `Pay for the data at ${url}` },
  } as unknown as Memory;

  const isValid = await x402PayAction.validate(runtime, message);
  console.log("validate() ->", isValid);

  if (!privateKey) {
    console.log("\nSet ARCRELAY_PRIVATE_KEY to actually attempt a payment. Skipping handler call.");
    server.close();
    return;
  }

  const result = await x402PayAction.handler(runtime, message, undefined, undefined, async (content) => {
    console.log("callback ->", content.text);
    return [];
  });

  console.log("handler result ->", result);
  server.close();
}

main().catch((err) => {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
