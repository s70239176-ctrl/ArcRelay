/**
 * app/api/agent/orchestrate/route.ts
 *
 * Orchestrator Agent SSE endpoint. Given a user prompt, determines which
 * capability nodes are needed, performs the x402 402-challenge -> signed
 * authorization -> fulfilment handshake against each one via
 * `app/api/v1/mock-nodes/[nodeId]`, and streams the whole run to the client
 * as Server-Sent Events: interleaved narration text chunks and structured
 * `PAYMENT_EVENT: {...}` lines the frontend parses into settlement-tape
 * entries.
 */

import { NextRequest } from "next/server";
import {
  getOrCreateAgentWallet,
  getUsdcBalance,
  signX402Payment,
  type X402PaymentRequirements,
} from "@/lib/circle-agent-wallet";

export const runtime = "nodejs";

interface PlannedNode {
  nodeId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Lightweight intent -> capability-node planner.
// A real orchestrator would use tool-calling against an LLM; here we use
// keyword routing so the whole pipeline runs deterministically offline.
// ---------------------------------------------------------------------------

function planNodes(prompt: string): PlannedNode[] {
  const p = prompt.toLowerCase();
  const plan: PlannedNode[] = [];

  if (/(contract|solidity|audit|vulnerab|reentran)/.test(p)) {
    plan.push({ nodeId: "solidity_audit_node", reason: "prompt references smart-contract risk" });
  }
  if (/(sec |10-k|10k|filing|edgar|market context|regulator)/.test(p)) {
    plan.push({ nodeId: "sec_data_node", reason: "prompt references regulatory / filings context" });
  }
  if (/(sentiment|social|bullish|bearish|hype)/.test(p)) {
    plan.push({ nodeId: "sentiment_node", reason: "prompt references market sentiment" });
  }
  if (/(liquidity|routing|swap|cross-chain|bridge)/.test(p)) {
    plan.push({ nodeId: "liquidity_router_node", reason: "prompt references liquidity routing" });
  }

  if (plan.length === 0) {
    // Fallback default plan so any prompt still demonstrates the full flow.
    plan.push(
      { nodeId: "sec_data_node", reason: "default market-context enrichment" },
      { nodeId: "sentiment_node", reason: "default sentiment enrichment" }
    );
  }

  return plan;
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { prompt } = (await req.json()) as { prompt?: string };

  if (!prompt || !prompt.trim()) {
    return new Response(JSON.stringify({ error: "A prompt is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const origin = req.nextUrl.origin;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      try {
        const wallet = await getOrCreateAgentWallet();
        push(sse("text", `Orchestrator received prompt: "${prompt.trim()}"\n`));
        push(
          sse(
            "text",
            `Agent Wallet ready — ${wallet.address} on Arc L1 (${wallet.mode} mode)\n`
          )
        );

        const plan = planNodes(prompt);
        push(
          sse(
            "text",
            `Planned ${plan.length} capability node${plan.length > 1 ? "s" : ""}: ${plan
              .map((n) => n.nodeId)
              .join(", ")}\n`
          )
        );

        let sessionSpend = 0;

        for (const step of plan) {
          push(sse("text", `\n> Dispatching job to ${step.nodeId} (${step.reason})...`));

          const endpoint = `${origin}/api/v1/mock-nodes/${step.nodeId}`;

          // 1) Initial request without payment -> expect HTTP 402
          const challengeRes = await fetch(endpoint, { method: "POST" });

          if (challengeRes.status !== 402) {
            push(sse("text", `\n! Unexpected response from ${step.nodeId}: ${challengeRes.status}`));
            continue;
          }

          const challenge = (await challengeRes.json()) as {
            accepts: X402PaymentRequirements[];
          };
          const requirements = challenge.accepts[0];

          push(
            sse(
              "text",
              `\n< 402 Payment Required — ${requirements.description} for $${(
                Number(requirements.maxAmountRequired) / 1_000_000
              ).toFixed(4)} USDC`
            )
          );

          // 2) Sign x402 authorization with the Agent Wallet
          const authorization = await signX402Payment(wallet, requirements);
          push(sse("text", `\n> Signed x402 authorization (nonce ${authorization.payload.authorization.nonce.slice(0, 10)}…)`));

          // 3) Re-send with X-PAYMENT header
          const fulfilRes = await fetch(endpoint, {
            method: "POST",
            headers: { "X-PAYMENT": JSON.stringify(authorization) },
          });

          if (!fulfilRes.ok) {
            push(sse("text", `\n! Payment/fulfilment failed for ${step.nodeId}: ${fulfilRes.status}`));
            continue;
          }

          const result = (await fulfilRes.json()) as {
            label: string;
            capability: string;
            result: string;
            payment: { amountUsdc: number; chain: string; txHash: string };
            latencyMs: number;
          };

          sessionSpend += result.payment.amountUsdc;

          push(sse("text", `\n< ${result.label} → ${result.result}`));

          push(
            sse("payment", {
              type: "PAYMENT_EVENT",
              nodeId: step.nodeId,
              label: result.label,
              capability: result.capability,
              amountUsdc: result.payment.amountUsdc,
              chain: result.payment.chain,
              txHash: result.payment.txHash,
              latencyMs: result.latencyMs,
              timestamp: new Date().toISOString(),
            })
          );
        }

        const balance = await getUsdcBalance(wallet, { sessionSpend });

        push(
          sse("text", `\n\nSession complete. Total spend: $${sessionSpend.toFixed(4)} USDC. Remaining balance: ${balance.formatted} USDC.`)
        );
        push(
          sse("summary", {
            sessionSpend,
            gasSaved: sessionSpend, // Arc's native-USDC-gas + Gateway batching means no separate gas leg
            nodesRun: plan.length,
            remainingBalance: balance.usdc,
          })
        );
        push(sse("done", { ok: true }));
      } catch (err) {
        push(
          sse("text", `\n! Orchestrator error: ${err instanceof Error ? err.message : "unknown error"}`)
        );
        push(sse("done", { ok: false }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
