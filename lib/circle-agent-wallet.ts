/**
 * lib/circle-agent-wallet.ts
 *
 * Helper utilities for initializing a Circle Agent Wallet, reading its
 * live USDC balance on Arc L1, and producing x402 payment-authorization
 * signatures for agent-to-agent nanopayments.
 *
 * Reference:
 *  - Circle Agent Stack:        https://developers.circle.com/agent-stack
 *  - Circle x402 protocol:      https://github.com/circlefin/x402
 *  - Arc L1 testnet explorer:   https://arc-testnet.explorer.circle.com/
 *
 * This module runs in both "live" mode (real Circle Developer-Controlled
 * Wallets API credentials present) and "mock" mode (no credentials, or
 * `ARCRELAY_FORCE_MOCK=1`), so the rest of the app never has to know which
 * mode it's in.
 */

import { randomBytes, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentWallet {
  walletId: string;
  address: `0x${string}`;
  chain: "ARC-TESTNET";
  entitySecretConfigured: boolean;
  mode: "live" | "mock";
}

export interface UsdcBalance {
  address: string;
  chain: "ARC-TESTNET";
  usdc: number;
  formatted: string;
  fetchedAt: string;
}

export interface X402PaymentRequirements {
  scheme: "exact";
  network: "arc-testnet";
  maxAmountRequired: string; // atomic USDC units (6 decimals), as a string
  resource: string;
  description: string;
  payTo: `0x${string}`;
  asset: `0x${string}`; // USDC contract on Arc L1
  extra?: Record<string, unknown>;
}

export interface X402PaymentAuthorization {
  x402Version: 1;
  scheme: "exact";
  network: "arc-testnet";
  payload: {
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
      validAfter: number;
      validBefore: number;
      nonce: `0x${string}`;
    };
    signature: `0x${string}`;
  };
}

// ---------------------------------------------------------------------------
// Config / mode detection
// ---------------------------------------------------------------------------

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET ?? "";
const FORCE_MOCK = process.env.ARCRELAY_FORCE_MOCK === "1";

export const WALLET_MODE: "live" | "mock" =
  FORCE_MOCK || !CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET ? "mock" : "live";

// USDC contract address on Arc L1 testnet (native-gas EVM chain).
export const ARC_USDC_ADDRESS: `0x${string}` =
  (process.env.ARC_USDC_ADDRESS as `0x${string}`) ??
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const MOCK_SEED_ADDRESS: `0x${string}` =
  "0x7A3f9C2eE1B8D4a5F60127E4d9C3aA1b8E5c0F42";

// ---------------------------------------------------------------------------
// Wallet initialization
// ---------------------------------------------------------------------------

/**
 * Initializes (or reuses) the orchestrator's Circle Agent Wallet.
 * In live mode this would call Circle's Developer-Controlled Wallets API
 * (`POST /v1/w3s/developer/wallets`) scoped to the Arc L1 testnet chain.
 * In mock mode a deterministic wallet is synthesized so the UI and SSE
 * pipeline behave identically without credentials.
 */
export async function getOrCreateAgentWallet(): Promise<AgentWallet> {
  if (WALLET_MODE === "mock") {
    return {
      walletId: "mock-wallet-arcrelay-orchestrator",
      address: MOCK_SEED_ADDRESS,
      chain: "ARC-TESTNET",
      entitySecretConfigured: false,
      mode: "mock",
    };
  }

  // --- Live path -----------------------------------------------------------
  // Left intentionally minimal: real deployments should call
  // developers.circle.com/agent-stack wallet-creation endpoints here and
  // cache the resulting walletId/address (e.g. in KV or a database).
  const res = await fetch("https://api.circle.com/v1/w3s/developer/wallets", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Circle wallet lookup failed (${res.status}): ${await res.text()}`
    );
  }

  const data = (await res.json()) as {
    data: { wallets: Array<{ id: string; address: string }> };
  };
  const wallet = data.data.wallets[0];

  if (!wallet) {
    throw new Error("No Circle Agent Wallet provisioned for this entity.");
  }

  return {
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
    chain: "ARC-TESTNET",
    entitySecretConfigured: true,
    mode: "live",
  };
}

// ---------------------------------------------------------------------------
// Balance retrieval
// ---------------------------------------------------------------------------

/**
 * Reads the wallet's live USDC balance on Arc L1. Arc uses native USDC gas,
 * so this figure represents both spendable balance and available gas.
 */
export async function getUsdcBalance(
  wallet: AgentWallet,
  opts: { sessionSpend?: number } = {}
): Promise<UsdcBalance> {
  if (wallet.mode === "mock") {
    // Deterministic starting balance minus whatever the session has spent,
    // so the UI shows a believable, consistent draw-down as agents run.
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

  const res = await fetch(
    `https://api.circle.com/v1/w3s/wallets/${wallet.walletId}/balances`,
    {
      headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`Circle balance lookup failed (${res.status})`);
  }

  const data = (await res.json()) as {
    data: { tokenBalances: Array<{ token: { symbol: string }; amount: string }> };
  };
  const usdcEntry = data.data.tokenBalances.find((b) => b.token.symbol === "USDC");
  const usdc = usdcEntry ? Number(usdcEntry.amount) : 0;

  return {
    address: wallet.address,
    chain: "ARC-TESTNET",
    usdc,
    formatted: usdc.toFixed(4),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// x402 payload signing
// ---------------------------------------------------------------------------

function toAtomicUsdc(amount: number): string {
  return Math.round(amount * 1_000_000).toString(); // USDC = 6 decimals
}

function pseudoHash(input: string): `0x${string}` {
  return `0x${createHash("sha256").update(input).digest("hex")}` as `0x${string}`;
}

/**
 * Builds and signs an x402 "exact" scheme payment authorization in response
 * to a sub-agent's HTTP 402 challenge. In live mode this delegates the
 * actual EIP-3009 `transferWithAuthorization` signature to Circle's Agent
 * Wallet signing endpoint; in mock mode it synthesizes a structurally valid
 * (but non-broadcastable) authorization + signature so the full 402
 * handshake can be exercised end to end locally.
 */
export async function signX402Payment(
  wallet: AgentWallet,
  requirements: X402PaymentRequirements
): Promise<X402PaymentAuthorization> {
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

  if (wallet.mode === "mock") {
    const signature = pseudoHash(
      `mock-sig:${authorization.from}:${authorization.to}:${authorization.value}:${authorization.nonce}`
    );
    return {
      x402Version: 1,
      scheme: "exact",
      network: "arc-testnet",
      payload: { authorization, signature },
    };
  }

  // --- Live path -----------------------------------------------------------
  const res = await fetch(
    `https://api.circle.com/v1/w3s/developer/sign/typedData`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        walletId: wallet.walletId,
        entitySecretCiphertext: CIRCLE_ENTITY_SECRET,
        data: {
          types: {
            TransferWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" },
            ],
          },
          primaryType: "TransferWithAuthorization",
          domain: { name: "USD Coin", version: "2", verifyingContract: requirements.asset },
          message: authorization,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`x402 signing failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { data: { signature: string } };

  return {
    x402Version: 1,
    scheme: "exact",
    network: "arc-testnet",
    payload: { authorization, signature: data.data.signature as `0x${string}` },
  };
}

/** Convenience: build the 402 requirements object a mock sub-agent quotes. */
export function buildPaymentRequirements(opts: {
  amountUsdc: number;
  resource: string;
  description: string;
  payTo: `0x${string}`;
}): X402PaymentRequirements {
  return {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: toAtomicUsdc(opts.amountUsdc),
    resource: opts.resource,
    description: opts.description,
    payTo: opts.payTo,
    asset: ARC_USDC_ADDRESS,
  };
}

/** Synthesizes a plausible Arc L1 settlement tx hash for the tape UI. */
export function mockSettlementTxHash(seed: string): `0x${string}` {
  return pseudoHash(`arc-settlement:${seed}:${Date.now()}`).slice(0, 42) as `0x${string}`;
}
