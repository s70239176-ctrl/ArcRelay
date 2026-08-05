/**
 * @arcrelay/sdk
 *
 * Seller side:  `x402Middleware()` — protect an Express route in one line.
 * Buyer side:   `ArcRelayClient`   — pay for x402-protected resources, with
 *                                    optional per-payment / session spend
 *                                    limits, from a script or an autonomous
 *                                    agent.
 *
 * Both are thin wrappers over Circle's real `@circle-fin/x402-batching` SDK
 * (Circle Gateway settlement on Arc L1 and other Gateway-supported chains)
 * — no mock/simulated payment path ships in this package.
 */

export { x402Middleware, ARC_NETWORKS } from "./middleware.js";
export type { X402MiddlewareOptions, X402Middleware } from "./middleware.js";

export { ArcRelayClient } from "./client.js";
export type { ArcRelayClientOptions, PayResult } from "./client.js";
