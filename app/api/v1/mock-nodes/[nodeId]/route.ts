/**
 * app/api/v1/mock-nodes/[nodeId]/route.ts
 *
 * A sub-agent capability node (e.g. `sec_data_node`, `sentiment_node`,
 * `solidity_audit_node`). Each node is gated behind Circle's x402
 * micropayment protocol.
 *
 * - **Live mode** (`ARCRELAY_PRIVATE_KEY` set): requests are processed by a
 *   real `x402HTTPResourceServer` backed by Circle's `BatchFacilitatorClient`
 *   (see `lib/x402-server.ts`) — genuine HTTP 402 challenges, genuine
 *   verify/settle calls to Circle Gateway's testnet API, genuine Arc L1
 *   settlement transaction hashes.
 * - **Mock mode** (default): a self-contained 402 challenge/response cycle
 *   with a synthesized signature and tx hash — no network calls to Circle,
 *   so the whole pipeline runs offline with zero setup.
 *
 * Reference: https://www.npmjs.com/package/@circle-fin/x402-batching
 */

import { NextRequest, NextResponse } from "next/server";
import { WALLET_MODE, mockSettlementTxHash } from "@/lib/circle-agent-wallet";
import { createGatewayHttpServer, buildRequestContext } from "@/lib/x402-server";

// ---------------------------------------------------------------------------
// Node registry — capability metadata for each sub-agent.
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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ nodeId: string }> }
) {
  const { nodeId } = await ctx.params;
  const node = NODE_REGISTRY[nodeId];

  if (!node) {
    return NextResponse.json({ error: `Unknown capability node: "${nodeId}"` }, { status: 404 });
  }

  try {
    return WALLET_MODE === "live"
      ? await handleLive(req, nodeId, node)
      : await handleMock(req, nodeId, node);
  } catch (err) {
    // Without this, an uncaught exception here (e.g. the Gateway
    // resource server failing to initialize/reach Circle's API) surfaces
    // to the client as an opaque empty-body HTTP 500 — nothing to debug
    // from. Logging + a real error body makes the actual failure visible
    // in both `vercel logs`/the dashboard and the response itself.
    console.error(`[mock-nodes/${nodeId}] unhandled error:`, err);
    return NextResponse.json(
      {
        error: "Internal error processing payment request.",
        message: err instanceof Error ? err.message : String(err),
        mode: WALLET_MODE,
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Live: real x402 + Circle Gateway settlement
// ---------------------------------------------------------------------------

async function handleLive(
  req: NextRequest,
  nodeId: string,
  node: (typeof NODE_REGISTRY)[string]
) {
  const httpServer = await createGatewayHttpServer({
    resource: `/api/v1/mock-nodes/${nodeId}`,
    description: node.capability,
    priceUsdc: node.priceUsdc,
    payTo: SELLER_ADDRESS,
  });

  const context = buildRequestContext(req);
  const result = await httpServer.processHTTPRequest(context);

  if (result.type === "no-payment-required") {
    // Every route on this server requires payment; this branch is
    // unreachable in practice but handled defensively.
    return NextResponse.json({ error: "No payment required (unexpected)." }, { status: 500 });
  }

  if (result.type === "payment-error") {
    return NextResponse.json(result.response.body, {
      status: result.response.status,
      headers: result.response.headers,
    });
  }

  // `result.type === "payment-verified"` — do the actual work, then settle.
  const latency = randomLatency(node.latencyMs);
  await sleep(latency);

  const settlement = await httpServer.processSettlement(
    result.paymentPayload,
    result.paymentRequirements
  );

  if (!settlement.success) {
    return NextResponse.json(
      { error: settlement.errorReason ?? "Settlement failed." },
      { status: 402, headers: settlement.headers }
    );
  }

  return NextResponse.json(
    {
      nodeId,
      label: node.label,
      capability: node.capability,
      result: mockResultFor(nodeId),
      payment: {
        amountUsdc: node.priceUsdc,
        settlement: "circle-gateway-batched",
        chain: "ARC-TESTNET",
        txHash: settlement.transaction,
      },
      latencyMs: latency,
    },
    { headers: settlement.headers }
  );
}

// ---------------------------------------------------------------------------
// Mock: self-contained 402 handshake, no network calls to Circle
// ---------------------------------------------------------------------------

interface MockPaymentRequirements {
  scheme: "exact";
  network: "arc-testnet";
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: `0x${string}`;
  asset: `0x${string}`;
}

const MOCK_ASSET: `0x${string}` = "0x3600000000000000000000000000000000000000";

function toAtomicUsdc(amount: number): string {
  return Math.round(amount * 1_000_000).toString();
}

async function handleMock(
  req: NextRequest,
  nodeId: string,
  node: (typeof NODE_REGISTRY)[string]
) {
  const paymentHeader = req.headers.get("x-payment");
  const requirements: MockPaymentRequirements = {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: toAtomicUsdc(node.priceUsdc),
    resource: `/api/v1/mock-nodes/${nodeId}`,
    description: node.capability,
    payTo: SELLER_ADDRESS,
    asset: MOCK_ASSET,
  };

  // --- Step 1: no payment attached -> challenge with HTTP 402 -------------
  if (!paymentHeader) {
    return NextResponse.json(
      { x402Version: 1, error: "Payment Required", accepts: [requirements] },
      { status: 402 }
    );
  }

  // --- Step 2: verify the attached x402 authorization ----------------------
  let authorization: {
    payload: { authorization: { to: string; value: string; nonce: string }; signature: string };
  };
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
      { error: "Payment verification failed: amount or payee mismatch.", accepts: [requirements] },
      { status: 402 }
    );
  }

  // --- Step 3: fulfil the job, synthesize a settlement tx hash -------------
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
      settlement: "mock-local",
      chain: "ARC-TESTNET",
      txHash,
    },
    latencyMs: latency,
  });
}
