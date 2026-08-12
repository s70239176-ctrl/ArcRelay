/**
 * lib/x402-server.ts
 *
 * Seller-side (sub-agent node) x402 wiring for live mode. Wraps the
 * standard, framework-agnostic `@x402/core` resource server with Circle's
 * `BatchFacilitatorClient` so payments are verified and settled via Circle
 * Gateway's batched settlement, per Circle's documented "already using
 * @x402/core" integration:
 *
 *   import { x402ResourceServer } from '@x402/core/server';
 *   import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server';
 *   const server = new x402ResourceServer([new BatchFacilitatorClient()]);
 *   await server.initialize();
 *
 * (see https://www.npmjs.com/package/@circle-fin/x402-batching)
 *
 * Next.js's App Router route handlers use the standard Web `Request`/
 * `Response` objects rather than Express's `(req, res, next)`, so instead of
 * Circle's `createGatewayMiddleware` Express helper we implement the small
 * `HTTPAdapter` interface `@x402/core` expects and drive
 * `x402HTTPResourceServer` directly.
 */

import { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/http";
import type { HTTPAdapter, HTTPRequestContext, RouteConfig, FacilitatorClient } from "@x402/core/http";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

// Arc L1 testnet chain ID (CAIP-2 `eip155:<id>`), per
// @circle-fin/x402-batching's internal chain config.
export const ARC_TESTNET_NETWORK = "eip155:5042002" as const;

const GATEWAY_API_TESTNET_URL =
  process.env.ARCRELAY_GATEWAY_URL ?? "https://gateway-api-testnet.circle.com";

// ---------------------------------------------------------------------------
// Web Fetch -> @x402/core HTTPAdapter
// ---------------------------------------------------------------------------

export class WebFetchHTTPAdapter implements HTTPAdapter {
  constructor(private readonly request: Request) {}

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }
  getMethod(): string {
    return this.request.method;
  }
  getPath(): string {
    return new URL(this.request.url).pathname;
  }
  getUrl(): string {
    return this.request.url;
  }
  getAcceptHeader(): string {
    return this.request.headers.get("accept") ?? "*/*";
  }
  getUserAgent(): string {
    return this.request.headers.get("user-agent") ?? "";
  }
}

// ---------------------------------------------------------------------------
// Resource server singleton (cached across requests in the same runtime so
// `initialize()` — which fetches supported payment kinds from Circle Gateway
// — only runs once, not on every call).
// ---------------------------------------------------------------------------

interface GlobalWithX402 {
  __arcrelayResourceServer?: x402ResourceServer;
  __arcrelayResourceServerReady?: Promise<void>;
}
const globalForX402 = globalThis as GlobalWithX402;

function getResourceServer(): x402ResourceServer {
  if (!globalForX402.__arcrelayResourceServer) {
    const facilitator = new BatchFacilitatorClient({ url: GATEWAY_API_TESTNET_URL });
    // @circle-fin/x402-batching declares its own structurally-equivalent
    // (but not identical — e.g. `resource.description` optionality differs)
    // copy of @x402/core's `FacilitatorClient` interface. The runtime shape
    // is compatible; this cast bridges the two packages' duplicate types.
    const server = new x402ResourceServer([facilitator as unknown as FacilitatorClient]);
    // Circle's facilitator.getSupported() tells the resource server what
    // Gateway itself can verify/settle, but the resource server separately
    // needs a *locally registered* SchemeNetworkServer to actually build
    // payment requirements (compute atomic amounts from a price string,
    // resolve asset decimals, etc.) — without this, buildPaymentRequirements
    // silently produces an empty `accepts` array even for networks the
    // facilitator genuinely supports, which is what caused the initial
    // "402 with no payment options" bug this registration call fixes.
    registerExactEvmScheme(server, { networks: [ARC_TESTNET_NETWORK] });
    globalForX402.__arcrelayResourceServer = server;
  }
  return globalForX402.__arcrelayResourceServer;
}

async function ensureInitialized(server: x402ResourceServer): Promise<void> {
  if (!globalForX402.__arcrelayResourceServerReady) {
    globalForX402.__arcrelayResourceServerReady = server.initialize();
  }
  await globalForX402.__arcrelayResourceServerReady;
}

// ---------------------------------------------------------------------------
// Per-request helper
// ---------------------------------------------------------------------------

export interface GatewayRouteParams {
  resource: string;
  description: string;
  priceUsdc: number;
  payTo: `0x${string}`;
}

/**
 * Builds an `x402HTTPResourceServer` scoped to a single route/price — cheap
 * to construct (no network call; only `initialize()` on the shared
 * `x402ResourceServer` hits the network, and that's cached above).
 */
export async function createGatewayHttpServer(
  params: GatewayRouteParams
): Promise<x402HTTPResourceServer> {
  const resourceServer = getResourceServer();
  await ensureInitialized(resourceServer);

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: ARC_TESTNET_NETWORK,
      payTo: params.payTo,
      price: `$${params.priceUsdc.toFixed(4)}`,
    },
    resource: params.resource,
    description: params.description,
    mimeType: "application/json",
  };

  return new x402HTTPResourceServer(resourceServer, routeConfig);
}

export function buildRequestContext(request: Request): HTTPRequestContext {
  const adapter = new WebFetchHTTPAdapter(request);
  return {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
  };
}
