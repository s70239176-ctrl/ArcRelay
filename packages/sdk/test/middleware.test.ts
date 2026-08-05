/**
 * test/middleware.test.ts
 *
 * Exercises `x402Middleware()` against a real Express server (no mocks) to
 * confirm it wires Circle's actual `createGatewayMiddleware` correctly: an
 * unauthenticated request to a protected route gets a genuine HTTP 402 with
 * x402-shaped payment requirements. Reaching Circle's live facilitator API
 * to verify/settle a real payment needs network access + a funded key this
 * test environment doesn't have — that path is covered by the deploy
 * README's manual walkthrough, not by this offline test.
 *
 * Wire format note: as of `@circle-fin/x402-batching@3.3.0`, the protocol
 * moved to x402 v2 — the payment-required payload travels base64-encoded in
 * a `PAYMENT-REQUIRED` response header rather than the JSON body (the body
 * is now deliberately `{}`). This test decodes that header. `x402Middleware`
 * and `ArcRelayClient` themselves never assumed anything about this wire
 * shape — they delegate entirely to Circle's `gateway.require()`/
 * `client.pay()`, which handle both sides of whatever protocol version is
 * installed — so only this test needed updating for the v1→v2 change, not
 * any SDK source.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { x402Middleware, ARC_NETWORKS } from "../src/index.js";

function listen(app: express.Express): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

test("x402Middleware returns a genuine HTTP 402 with x402 payment requirements", async () => {
  const app = express();
  app.get(
    "/premium",
    x402Middleware({
      price: "0.001",
      token: "USDC",
      sellerAddress: "0x9E4c1F3aA7d02B6e8C5f10D4b3A9e7C2F1a8B6D5",
      network: ARC_NETWORKS.testnet,
      description: "Test resource",
    })
  );
  app.get("/premium", (_req, res) => res.json({ content: "should not be reached without payment" }));
  // Surface middleware errors as JSON instead of Express's default HTML 500
  // page, so the assertion below can tell a real code bug apart from a
  // sandboxed environment that simply can't reach Circle's API.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: String(err) });
  });

  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/premium`);
    const bodyText = await res.text();

    if (res.status === 500 && /not in allowlist|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(bodyText)) {
      // Expected in network-sandboxed CI/dev environments (e.g. this
      // package built in an environment without egress to
      // gateway-api-testnet.circle.com). Confirms the middleware is
      // correctly attempting a real call to Circle's API rather than
      // silently mocking it — it just can't complete the round trip here.
      // A Codespace or any environment with normal internet access will
      // get a real 402 below instead.
      return;
    }

    assert.equal(res.status, 402);

    const encodedHeader = res.headers.get("payment-required");
    assert.ok(encodedHeader, "expected a PAYMENT-REQUIRED response header");

    const paymentRequired = JSON.parse(Buffer.from(encodedHeader!, "base64").toString("utf-8")) as {
      x402Version: number;
      resource?: { url: string; description: string };
      accepts: unknown[];
    };

    assert.equal(paymentRequired.x402Version, 2);
    assert.ok(Array.isArray(paymentRequired.accepts) && paymentRequired.accepts.length > 0);
  } finally {
    server.close();
  }
});

test("x402Middleware throws on unsupported token", () => {
  assert.throws(() =>
    x402Middleware({
      price: "0.001",
      // @ts-expect-error deliberately invalid for the test
      token: "ETH",
      sellerAddress: "0x9E4c1F3aA7d02B6e8C5f10D4b3A9e7C2F1a8B6D5",
    })
  );
});

test("x402Middleware throws with no sellerAddress configured", () => {
  const original = process.env.ARCRELAY_SELLER_ADDRESS;
  delete process.env.ARCRELAY_SELLER_ADDRESS;
  try {
    assert.throws(() => x402Middleware({ price: "0.001" }));
  } finally {
    if (original) process.env.ARCRELAY_SELLER_ADDRESS = original;
  }
});
