/**
 * lib/circle-agent-wallet.ts
 *
 * Buyer-side wallet for the ArcRelay orchestrator. Wraps Circle's real
 * `GatewayClient` (from `@circle-fin/x402-batching/client`) for live mode,
 * and a self-contained, zero-network mock for local/offline development.
 *
 * Live mode requires an EVM private key funded with testnet USDC on Arc L1
 * (get some from https://faucet.circle.com) and deposited into the Gateway
 * Wallet (`client.deposit(...)`) before nanopayments will settle. Without
 * that, `payResource()` falls back to a synthesized 402 handshake so the
 * full pipeline still runs end to end offline.
 *
 * Reference:
 *  - Circle Agent Stack:   https://developers.circle.com/agent-stack
 *  - Circle Gateway:       https://developers.circle.com/gateway
 *  - x402-batching SDK:    https://www.npmjs.com/package/@circle-fin/x402-batching
 *  - Arc testnet explorer: https://arc-testnet.explorer.circle.com/
 */

import { randomBytes, createHash } from "crypto";
import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";
import type { ExecutionStage } from "@/lib/agent-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentWallet {
  address: `0x${string}`;
  chain: "ARC-TESTNET";
  mode: "live" | "mock";
}

export interface UsdcBalance {
  address: string;
  chain: "ARC-TESTNET";
  usdc: number;
  formatted: string;
  fetchedAt: string;
}

export interface DetailedBalances {
  address: string;
  chain: "ARC-TESTNET";
  mode: "live" | "mock";
  wallet: { usdc: number; formatted: string };
  gateway: {
    total: number;
    available: number;
    withdrawing: number;
    withdrawable: number;
    formattedTotal: string;
    formattedAvailable: string;
    formattedWithdrawing: string;
    formattedWithdrawable: string;
  };
  fetchedAt: string;
}

export interface PayResourceResult {
  data: unknown;
  amountUsdc: number;
  txHash: string;
  chain: "ARC-TESTNET";
  settlement: "circle-gateway-batched" | "mock-local";
}

// ---------------------------------------------------------------------------
// Config / mode detection
// ---------------------------------------------------------------------------

const PRIVATE_KEY = process.env.ARCRELAY_PRIVATE_KEY?.trim() as Hex | undefined;
const FORCE_MOCK = process.env.ARCRELAY_FORCE_MOCK === "1";
const ARC_CHAIN: SupportedChainName = "arcTestnet";

export const WALLET_MODE: "live" | "mock" = FORCE_MOCK || !PRIVATE_KEY ? "mock" : "live";

// Real USDC address on Arc L1 testnet (native-gas precompile-style address),
// per @circle-fin/x402-batching's CHAIN_CONFIGS.arcTestnet.
export const ARC_USDC_ADDRESS: `0x${string}` =
  (process.env.ARC_USDC_ADDRESS as `0x${string}`) ??
  "0x3600000000000000000000000000000000000000";

const MOCK_SEED_ADDRESS: `0x${string}` = "0x7A3f9C2eE1B8D4a5F60127E4d9C3aA1b8E5c0F42";

// ---------------------------------------------------------------------------
// Live GatewayClient singleton
// ---------------------------------------------------------------------------
// Cached on `globalThis` so Next.js dev-mode hot reloads (and repeated
// serverless invocations in the same runtime) reuse one client/signer
// instead of re-deriving the account on every request.

interface GlobalWithGateway {
  __arcrelayGatewayClient?: GatewayClient;
}
const globalForGateway = globalThis as GlobalWithGateway;

function getGatewayClient(): GatewayClient {
  if (!PRIVATE_KEY) {
    throw new Error("ARCRELAY_PRIVATE_KEY is not set; cannot construct a live GatewayClient.");
  }
  if (!globalForGateway.__arcrelayGatewayClient) {
    globalForGateway.__arcrelayGatewayClient = new GatewayClient({
      chain: ARC_CHAIN,
      privateKey: PRIVATE_KEY,
    });
  }
  return globalForGateway.__arcrelayGatewayClient;
}

// ---------------------------------------------------------------------------
// Wallet initialization
// ---------------------------------------------------------------------------

export async function getOrCreateAgentWallet(): Promise<AgentWallet> {
  if (WALLET_MODE === "mock") {
    return { address: MOCK_SEED_ADDRESS, chain: "ARC-TESTNET", mode: "mock" };
  }

  const client = getGatewayClient();
  return { address: client.address, chain: "ARC-TESTNET", mode: "live" };
}

// ---------------------------------------------------------------------------
// Balance retrieval
// ---------------------------------------------------------------------------

/**
 * Reads the wallet's USDC balance. In live mode this is the *wallet*
 * balance (not the Gateway balance) via `GatewayClient.getUsdcBalance()` —
 * call `getBalances()` directly if you need the Gateway-side available/
 * withdrawing breakdown too.
 */
export async function getUsdcBalance(
  wallet: AgentWallet,
  opts: { sessionSpend?: number } = {}
): Promise<UsdcBalance> {
  if (wallet.mode === "mock") {
    const base = 14.2204;
    const spend = opts.sessionSpend ?? 0;
    const usdc = Math.max(base - spend, 0);
    return {
      address: wallet.address,
      chain: "ARC-TESTNET",
      usdc,
      formatted: usdc.toFixed(4),
      fetchedAt: new Date().toISOString(),
    };
  }

  const client = getGatewayClient();
  // `getUsdcBalance()` also returns `balance` (bigint, atomic units) if a
  // caller ever needs exact precision instead of the floating-point field.
  const { formatted } = await client.getUsdcBalance();
  return {
    address: wallet.address,
    chain: "ARC-TESTNET",
    usdc: Number(formatted),
    formatted: Number(formatted).toFixed(4),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Reads the full wallet-vs-Gateway balance breakdown: plain wallet USDC,
 * plus Gateway `total`/`available`/`withdrawing`/`withdrawable`. This is
 * the distinction real testing surfaced matters: a successful `pay()` call
 * debits `gateway.available` immediately, but the on-chain transfer to the
 * seller follows on Circle's own batch settlement cadence, separately.
 */
export async function getDetailedBalances(
  wallet: AgentWallet,
  opts: { sessionSpend?: number } = {}
): Promise<DetailedBalances> {
  if (wallet.mode === "mock") {
    const base = 14.2204;
    const spend = opts.sessionSpend ?? 0;
    const walletUsdc = Math.max(base - spend, 0);
    // Mirrors the shape of a real deposited-and-partially-spent Gateway
    // balance, so the UI has something representative to render in mock
    // mode too, without pretending funds have actually moved anywhere.
    const gatewayTotal = 1.0;
    const gatewayAvailable = Math.max(gatewayTotal - spend, 0);
    return {
      address: wallet.address,
      chain: "ARC-TESTNET",
      mode: "mock",
      wallet: { usdc: walletUsdc, formatted: walletUsdc.toFixed(4) },
      gateway: {
        total: gatewayTotal,
        available: gatewayAvailable,
        withdrawing: 0,
        withdrawable: 0,
        formattedTotal: gatewayTotal.toFixed(4),
        formattedAvailable: gatewayAvailable.toFixed(4),
        formattedWithdrawing: "0.0000",
        formattedWithdrawable: "0.0000",
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  const client = getGatewayClient();
  const balances = await client.getBalances();

  return {
    address: wallet.address,
    chain: "ARC-TESTNET",
    mode: "live",
    wallet: { usdc: Number(balances.wallet.formatted), formatted: balances.wallet.formatted },
    gateway: {
      total: Number(balances.gateway.formattedTotal),
      available: Number(balances.gateway.formattedAvailable),
      withdrawing: Number(balances.gateway.formattedWithdrawing),
      withdrawable: Number(balances.gateway.formattedWithdrawable),
      formattedTotal: balances.gateway.formattedTotal,
      formattedAvailable: balances.gateway.formattedAvailable,
      formattedWithdrawing: balances.gateway.formattedWithdrawing,
      formattedWithdrawable: balances.gateway.formattedWithdrawable,
    },
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Unified x402 payment execution (live GatewayClient.pay, or local mock)
// ---------------------------------------------------------------------------

function pseudoHash(input: string): `0x${string}` {
  return `0x${createHash("sha256").update(input).digest("hex")}` as `0x${string}`;
}

/**
 * Pays for an x402-protected resource end to end and reports progress via
 * `onStage`. In live mode this delegates the entire 402 → verify → sign →
 * settle flow to Circle's real `GatewayClient.pay()`. In mock mode it
 * performs an equivalent, fully local handshake against the same mock
 * sub-agent route (see `app/api/v1/mock-nodes/[nodeId]/route.ts`) with a
 * synthesized (non-broadcastable) signature — no network calls to Circle.
 */
export async function payResource(
  wallet: AgentWallet,
  url: string,
  opts: {
    method?: "GET" | "POST";
    body?: unknown;
    onStage?: (stage: ExecutionStage) => void;
  } = {}
): Promise<PayResourceResult> {
  const emit = (stage: ExecutionStage) => opts.onStage?.(stage);

  if (wallet.mode === "live") {
    const client = getGatewayClient();

    emit("challenge_received");
    const support = await client.supports(url);
    if (!support.supported) {
      throw new Error(support.error ?? `Resource at ${url} does not support Gateway batching.`);
    }

    emit("gateway_verification");
    emit("signature_generation");
    emit("settlement");

    const result = await client.pay(url, { method: opts.method ?? "POST", body: opts.body });

    emit("delivered");

    return {
      data: result.data,
      amountUsdc: Number(result.formattedAmount),
      txHash: result.transaction,
      chain: "ARC-TESTNET",
      settlement: "circle-gateway-batched",
    };
  }

  // --- Mock path: local 402 handshake, no network calls to Circle ----------
  emit("challenge_received");
  const challengeRes = await fetch(url, { method: opts.method ?? "POST" });

  if (challengeRes.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${url}, got ${challengeRes.status}`);
  }

  const challenge = (await challengeRes.json()) as {
    accepts: Array<{
      maxAmountRequired: string;
      resource: string;
      description: string;
      payTo: `0x${string}`;
      asset: `0x${string}`;
    }>;
  };
  const requirements = challenge.accepts[0];

  emit("gateway_verification");
  emit("signature_generation");

  const now = Math.floor(Date.now() / 1000);
  const nonce = pseudoHash(`${wallet.address}:${now}:${randomBytes(8).toString("hex")}`);
  const authorization = {
    from: wallet.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter: now - 60,
    validBefore: now + 120,
    nonce,
  };
  const signature = pseudoHash(
    `mock-sig:${authorization.from}:${authorization.to}:${authorization.value}:${authorization.nonce}`
  );
  const paymentHeader = JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "arc-testnet",
    payload: { authorization, signature },
  });

  emit("settlement");
  const fulfilRes = await fetch(url, {
    method: opts.method ?? "POST",
    headers: { "X-PAYMENT": paymentHeader },
  });

  if (!fulfilRes.ok) {
    throw new Error(`Payment/fulfilment failed for ${url}: ${fulfilRes.status}`);
  }

  const result = (await fulfilRes.json()) as {
    payment: { amountUsdc: number; txHash: string };
    [key: string]: unknown;
  };

  emit("delivered");

  return {
    data: result,
    amountUsdc: result.payment.amountUsdc,
    txHash: result.payment.txHash,
    chain: "ARC-TESTNET",
    settlement: "mock-local",
  };
}

/** Synthesizes a plausible Arc L1 settlement tx hash for mock-mode responses. */
export function mockSettlementTxHash(seed: string): `0x${string}` {
  return pseudoHash(`arc-settlement:${seed}:${Date.now()}`).slice(0, 42) as `0x${string}`;
}
