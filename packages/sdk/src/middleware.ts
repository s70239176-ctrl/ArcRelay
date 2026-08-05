/**
 * src/middleware.ts
 *
 * `x402Middleware()` — protect any Express route with one line:
 *
 *   app.get("/api/data", x402Middleware({ price: "0.001", token: "USDC" }));
 *
 * This is a thin, opinionated wrapper over Circle's own
 * `createGatewayMiddleware` (from `@circle-fin/x402-batching/server`) — it
 * doesn't reimplement the x402 protocol or Gateway settlement, it just
 * collapses Circle's two-call setup (`createGatewayMiddleware(...).require(price)`)
 * into the single-call shape most Express developers expect from a
 * `paywall(options)`-style middleware, and defaults sensibly for Arc L1.
 *
 * Every payment is verified against Circle Gateway's real facilitator API
 * and settled with a genuine on-chain (batched) Arc L1 transaction — there
 * is no mock/simulated path in this package. For local development without
 * live funds, see `@arcrelay/sdk`'s README for a `DRY_RUN` note.
 */

import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import type { GatewayMiddleware } from "@circle-fin/x402-batching/server";

/** The Express-compatible middleware function `x402Middleware()` returns. */
export type X402Middleware = ReturnType<GatewayMiddleware["require"]>;

/** Arc L1 mainnet/testnet CAIP-2 network identifiers, for convenience. */
export const ARC_NETWORKS = {
  testnet: "eip155:5042002",
  mainnet: "eip155:5042",
} as const;

export interface X402MiddlewareOptions {
  /**
   * Price to charge per request. Accepts a dollar string ("0.001",
   * "$0.001") — USDC is Circle Gateway's only settlement asset, so `token`
   * exists for documentation clarity and is validated rather than actually
   * switched on.
   */
  price: string;
  /** Must be "USDC" — Circle Gateway settles exclusively in USDC. */
  token?: "USDC";
  /**
   * Wallet address that receives settled payments. Falls back to
   * `ARCRELAY_SELLER_ADDRESS` so most integrations need zero config here.
   */
  sellerAddress?: string;
  /**
   * Network(s) to accept payment on, as CAIP-2 identifiers. Defaults to
   * Arc L1 testnet (`ARC_NETWORKS.testnet`). Pass `"all"` to accept any
   * Gateway-supported network.
   */
  network?: string | string[] | "all";
  /** Human-readable description of the protected resource, shown in 402 responses. */
  description?: string;
  /** Override the Gateway facilitator URL (defaults to Circle's testnet API). */
  facilitatorUrl?: string;
}

const DEFAULT_TESTNET_FACILITATOR_URL = "https://gateway-api-testnet.circle.com";

/**
 * Builds a ready-to-use Express middleware that requires an x402/Gateway
 * payment before the route handler runs. Equivalent to:
 *
 *   const gateway = createGatewayMiddleware({ sellerAddress, networks, facilitatorUrl });
 *   return gateway.require(price);
 *
 * but collapsed into the single call most Express middleware libraries use.
 */
export function x402Middleware(options: X402MiddlewareOptions): X402Middleware {
  const { price, token = "USDC", sellerAddress, network, description, facilitatorUrl } = options;

  if (token !== "USDC") {
    throw new Error(
      `x402Middleware: unsupported token "${token}". Circle Gateway settles exclusively in USDC.`
    );
  }

  const resolvedSellerAddress = sellerAddress ?? process.env.ARCRELAY_SELLER_ADDRESS;
  if (!resolvedSellerAddress) {
    throw new Error(
      "x402Middleware: no sellerAddress provided and ARCRELAY_SELLER_ADDRESS is not set."
    );
  }

  const networks =
    network === "all"
      ? undefined // omitting `networks` tells Circle's middleware to accept ALL supported networks
      : network ?? ARC_NETWORKS.testnet;

  const gateway = createGatewayMiddleware({
    sellerAddress: resolvedSellerAddress,
    networks,
    facilitatorUrl: facilitatorUrl ?? DEFAULT_TESTNET_FACILITATOR_URL,
    description,
  });

  return gateway.require(price);
}
