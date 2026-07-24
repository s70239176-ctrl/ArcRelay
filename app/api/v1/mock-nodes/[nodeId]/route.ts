/**
 * app/api/v1/mock-nodes/[nodeId]/route.ts
 *
 * A sub-agent capability node (e.g. `sec_data_node`, `sentiment_node`,
 * `solidity_audit_node`). Each node is gated behind Circle's x402
 * micropayment protocol: the first request without a valid payment header
 * is rejected with `HTTP 402 Payment Required` and a JSON body describing
 * the price; a follow-up request carrying a signed `X-PAYMENT` header is
 * fulfilled and (via `withGateway`) queued for Circle Gateway's off-chain
 * batched settlement to Arc L1.
 *
 * Reference: https://github.com/circlefin/x402
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildPaymentRequirements,
  mockSettlementTxHash,
  type X402PaymentAuthorization,
} from "@/lib/circle-agent-wallet";

// ---------------------------------------------------------------------------
// Node registry — capability metadata for each mock sub-agent.
// ---------------------------------------------------------------------------

const NODE_REGISTRY: Record<
  string,
  { label: string; capability: string; priceUsdc: number; latencyMs: [number, number] }
> = {
  sec_data_node: {
    label: "SecEdgar-Node-Alpha",
    capability: "SEC 10-K / 10-Q Retrieval",
    priceUsdc: 0.0003,
    latencyMs: [120, 260],
  },
  sentiment_node: {
    label: "SentimentPulse-Node-Beta",
    capability: "Market Sentiment Scoring",
    priceUsdc: 0.0002,
    latencyMs: [80, 180],
  },
  solidity_audit_node: {
    label: "AuditForge-Node-Gamma",
    capability: "Solidity Static Audit",
    priceUsdc: 0.0005,
    latencyMs: [200, 420],
  },
  liquidity_router_node: {
    label: "LiquidityRoute-Node-Delta",
    capability: "Cross-Chain Liquidity Routing",
    priceUsdc: 0.0004,
    latencyMs: [150, 300],
  },
};

const SELLER_ADDRESS =
  (process.env.ARCRELAY_SELLER_ADDRESS as `0x${string}`) ??
  "0x9E4c1F3aA7d02B6e8C5f10D4b3A9e7C2F1a8B6D5";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomLatency([min, max]: [number, number]) {
  return Math.round(min + Math.random() * (max - min));
}

// Wraps a handler with Circle's x402-batching Gateway helper, which queues
// a verified authorization for off-chain aggregation into a single Arc L1
// settlement transaction rather than broadcasting one tx per micropayment.
// (Mirrors `@circle-fin/x402-batching`'s `withGateway` wrapper contract.)
function withGateway<T>(
  handler: (req: NextRequest, ctx: { nodeId: string }) => Promise<T>
) {
  return async (req: NextRequest, ctx: { params: Promise<{ nodeId: string }> }) => {
    const { nodeId } = await ctx.params;
    return handler(req, { nodeId });
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const POST = withGateway(async (req, { nodeId }) => {
  const node = NODE_REGISTRY[nodeId];

  if (!node) {
    return NextResponse.json(
      { error: `Unknown capability node: "${nodeId}"` },
      { status: 404 }
    );
  }

  const paymentHeader = req.headers.get("x-payment");
  const requirements = buildPaymentRequirements({
    amountUsdc: node.priceUsdc,
    resource: `/api/v1/mock-nodes/${nodeId}`,
    description: node.capability,
    payTo: SELLER_ADDRESS,
  });

  // --- Step 1: no payment attached -> challenge with HTTP 402 --------------
  if (!paymentHeader) {
    return NextResponse.json(
      {
        x402Version: 1,
        error: "Payment Required",
        accepts: [requirements],
      },
      { status: 402 }
    );
  }

  // --- Step 2: verify the attached x402 authorization -----------------------
  let authorization: X402PaymentAuthorization;
  try {
    authorization = JSON.parse(paymentHeader);
  } catch {
    return NextResponse.json(
      { error: "Malformed X-PAYMENT header; expected a signed x402 authorization JSON." },
      { status: 400 }
    );
  }

  const auth = authorization?.payload?.authorization;
  const validPayload =
    auth?.to?.toLowerCase() === SELLER_ADDRESS.toLowerCase() &&
    auth?.value === requirements.maxAmountRequired &&
    Boolean(authorization.payload.signature);

  if (!validPayload) {
    return NextResponse.json(
      {
        error: "Payment verification failed: amount or payee mismatch.",
        accepts: [requirements],
      },
      { status: 402 }
    );
  }

  // --- Step 3: fulfil the job, queue settlement for Gateway batching --------
  const latency = randomLatency(node.latencyMs);
  await sleep(latency);

  const txHash = mockSettlementTxHash(`${nodeId}:${auth.nonce}`);

  return NextResponse.json({
    nodeId,
    label: node.label,
    capability: node.capability,
    result: mockResultFor(nodeId),
    payment: {
      amountUsdc: node.priceUsdc,
      settlement: "batched-off-chain-gateway",
      chain: "ARC-TESTNET",
      txHash,
    },
    latencyMs: latency,
  });
});

function mockResultFor(nodeId: string): string {
  switch (nodeId) {
    case "sec_data_node":
      return "Retrieved latest 10-K risk-factor deltas: 3 new items flagged under liquidity risk.";
    case "sentiment_node":
      return "Aggregate sentiment score: +0.62 (bullish lean across 1,204 sampled sources).";
    case "solidity_audit_node":
      return "Static audit complete: 1 medium-severity reentrancy pattern, 2 informational findings.";
    case "liquidity_router_node":
      return "Optimal route found across 3 pools; estimated slippage 0.04%.";
    default:
      return "Job complete.";
  }
}
