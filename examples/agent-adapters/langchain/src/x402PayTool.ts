/**
 * src/x402PayTool.ts
 *
 * A LangChain tool that lets an agent autonomously pay for any
 * x402-protected resource — its own infrastructure, a sub-agent's paywalled
 * API, a data provider, whatever the model decides it needs mid-run — via
 * `@arcrelay/sdk`'s `ArcRelayClient`. Built on `@langchain/core`'s real
 * `tool()` factory, not a bespoke shape.
 *
 * Usage:
 *
 *   import { ChatOpenAI } from "@langchain/openai";
 *   import { createReactAgent } from "langchain/agents"; // or your agent runtime of choice
 *   import { createX402PayTool } from "@arcrelay/langchain-adapter";
 *
 *   const payTool = createX402PayTool({
 *     privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
 *     maxPerPaymentUsdc: 0.01,
 *     maxSessionUsdc: 1.0,
 *   });
 *
 *   const agent = createReactAgent({ llm: new ChatOpenAI({ model: "gpt-4o" }), tools: [payTool] });
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ArcRelayClient, type ArcRelayClientOptions } from "@arcrelay/sdk";

const payToolSchema = z.object({
  url: z.string().url().describe("The full URL of the x402-protected resource to pay for and fetch."),
  method: z.enum(["GET", "POST"]).default("GET").describe("HTTP method to use for the request."),
  body: z
    .record(z.unknown())
    .optional()
    .describe("Optional JSON body to send with the request (for POST)."),
});

export interface CreateX402PayToolOptions extends ArcRelayClientOptions {
  /** Override the tool's name as seen by the LLM. Defaults to "x402_pay". */
  name?: string;
}

/**
 * Builds a LangChain tool bound to one `ArcRelayClient` instance — spend
 * limits and running session totals are shared across every call the agent
 * makes with this tool, for the lifetime of the process/conversation.
 */
export function createX402PayTool(options: CreateX402PayToolOptions) {
  const client = new ArcRelayClient(options);

  return tool(
    async ({ url, method, body }) => {
      const result = await client.pay(url, { method, body });
      return JSON.stringify({
        data: result.data,
        amountUsdc: result.amountUsdc,
        txHash: result.txHash,
        sessionSpendSoFar: client.sessionSpend,
      });
    },
    {
      name: options.name ?? "x402_pay",
      description:
        "Pay for and fetch an x402-protected (HTTP 402) resource using the agent's own Arc L1 " +
        "Gateway wallet — no human approval needed per call, subject to the configured spend limits. " +
        "Use this whenever a request to a URL returns 402 Payment Required, or when you already know " +
        "a resource requires x402 payment.",
      schema: payToolSchema,
    }
  );
}

export { ArcRelayClient } from "@arcrelay/sdk";
