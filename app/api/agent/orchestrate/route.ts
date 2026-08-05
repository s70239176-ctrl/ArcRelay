/**
 * app/api/agent/orchestrate/route.ts
 *
 * Orchestrator Agent SSE endpoint. Given a user prompt, determines which
 * capability nodes are needed and pays each one via `payResource()` — which
 * delegates to Circle's real `GatewayClient.pay()` in live mode, or a local
 * mock 402 handshake otherwise (see `lib/circle-agent-wallet.ts`). Streams
 * the whole run to the client as Server-Sent Events: narration text,
 * `step` execution-stage events, `log` terminal entries, and `payment`
 * events the frontend renders into the settlement tape.
 */

import { NextRequest } from "next/server";
import { getOrCreateAgentWallet, getUsdcBalance, payResource } from "@/lib/circle-agent-wallet";
import type { ExecutionStage, LogEntry } from "@/lib/agent-types";

export const runtime = "nodejs";

function makeLog(partial: Omit<LogEntry, "id" | "timestamp">): LogEntry {
  return {
    ...partial,
    id: `${partial.nodeLabel}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
}

interface PlannedNode {
  nodeId: string;
  reason: string;
}

interface NodeResultBody {
  nodeId: string;
  label: string;
  capability: string;
  result: string;
  payment: { amountUsdc: number; settlement: string; chain: string; txHash: string };
  latencyMs: number;
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
    plan.push(
      { nodeId: "sec_data_node", reason: "default market-context enrichment" },
      { nodeId: "sentiment_node", reason: "default sentiment enrichment" }
    );
  }

  return plan;
}

const STAGE_LABEL: Record<ExecutionStage, string> = {
  challenge_received: "402 Payment Required challenge received",
  gateway_verification: "Circle Gateway verifying deposit balance",
  signature_generation: "Signing x402 payment authorization",
  settlement: "Settling on Arc L1 via Circle Gateway",
  delivered: "Payload delivered",
};

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
        push(sse("text", `Agent Wallet ready — ${wallet.address} on Arc L1 (${wallet.mode} mode)\n`));

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

          try {
            const paid = await payResource(wallet, endpoint, {
              method: "POST",
              onStage: (stage) => {
                push(sse("step", { stage, nodeId: step.nodeId, timestamp: new Date().toISOString() }));
                push(
                  sse(
                    "log",
                    makeLog({
                      category: stage === "settlement" || stage === "delivered" ? "relayer" : "x402",
                      status:
                        stage === "challenge_received"
                          ? "402_CHALLENGE"
                          : stage === "gateway_verification"
                          ? "GATEWAY_BATCHED"
                          : stage === "settlement"
                          ? "RELAY_SUBMITTED"
                          : stage === "delivered"
                          ? "200_OK"
                          : "402_CHALLENGE",
                      nodeLabel: step.nodeId,
                      message: STAGE_LABEL[stage],
                      payload: { nodeId: step.nodeId, stage },
                    })
                  )
                );
              },
            });

            const body = paid.data as NodeResultBody;
            sessionSpend += paid.amountUsdc;

            push(sse("text", `\n< ${body.label} → ${body.result}`));
            push(
              sse(
                "log",
                makeLog({
                  category: "relayer",
                  status: "RELAY_SUBMITTED",
                  nodeLabel: body.label,
                  message: `Settled $${paid.amountUsdc.toFixed(4)} USDC on Arc L1 (${paid.settlement}) — ${paid.txHash.slice(0, 10)}…`,
                  payload: { txHash: paid.txHash, chain: paid.chain, settlement: paid.settlement },
                })
              )
            );

            push(
              sse("payment", {
                type: "PAYMENT_EVENT",
                nodeId: step.nodeId,
                label: body.label,
                capability: body.capability,
                amountUsdc: paid.amountUsdc,
                chain: paid.chain,
                txHash: paid.txHash,
                latencyMs: body.latencyMs,
                timestamp: new Date().toISOString(),
              })
            );
          } catch (nodeErr) {
            const message = nodeErr instanceof Error ? nodeErr.message : "Unknown node error.";
            push(sse("text", `\n! ${step.nodeId} failed: ${message}`));
            push(
              sse(
                "log",
                makeLog({
                  category: "error",
                  status: "ERROR",
                  nodeLabel: step.nodeId,
                  message,
                  payload: { nodeId: step.nodeId },
                })
              )
            );
          }
        }

        const balance = await getUsdcBalance(wallet, { sessionSpend });

        push(
          sse(
            "text",
            `\n\nSession complete. Total spend: $${sessionSpend.toFixed(4)} USDC. Remaining balance: ${balance.formatted} USDC.`
          )
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
        push(sse("text", `\n! Orchestrator error: ${err instanceof Error ? err.message : "unknown error"}`));
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
