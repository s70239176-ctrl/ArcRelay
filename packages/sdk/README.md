# @arcrelay/sdk

Drop-in x402 middleware and buyer client for **Circle Gateway** nanopayments
on **Arc L1** (and any other Gateway-supported chain). Built directly on
Circle's real `@circle-fin/x402-batching` SDK — no mock or simulated
payment path ships in this package.

## Install

```bash
npm install @arcrelay/sdk
```

`express` is an optional peer dependency — only needed if you use
`x402Middleware`. `ArcRelayClient` (the buyer side) has no Express
dependency at all, so agent frameworks can use it standalone.

## Protect an API route in one line

```typescript
import express from "express";
import { x402Middleware } from "@arcrelay/sdk";

const app = express();

app.get(
  "/api/data",
  x402Middleware({ price: "0.001", token: "USDC" }),
  (req, res) => res.json({ data: "premium payload" })
);

app.listen(3000);
```

`sellerAddress` defaults to `process.env.ARCRELAY_SELLER_ADDRESS`, and
`network` defaults to Arc L1 testnet — most integrations need zero
additional config. Pass `network: "all"` to accept payment on every
Gateway-supported chain instead of just Arc.

Under the hood this is a thin wrapper over Circle's own
`createGatewayMiddleware(...).require(price)` — every payment is verified
against Circle Gateway's real facilitator API and settled with a genuine
(batched) Arc L1 transaction.

## Pay for a protected resource (agent / script side)

```typescript
import { ArcRelayClient } from "@arcrelay/sdk";

const client = new ArcRelayClient({
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  chain: "arcTestnet",
  maxPerPaymentUsdc: 0.01,   // hard ceiling per call
  maxSessionUsdc: 1.0,       // running budget across this client's lifetime
});

// One-time: fund the Gateway Wallet balance (get testnet USDC from
// https://faucet.circle.com first).
await client.deposit("5.00");

const { data, amountUsdc, txHash } = await client.pay("https://your-api.com/api/data");
console.log(data, amountUsdc, txHash);
```

Spend limits are enforced client-side via `GatewayClient`'s documented
lifecycle hooks, so an autonomous agent can call `pay()` freely without a
human approving every individual nanopayment, while still being unable to
exceed the budget you set.

## Agent framework adapters

See [`examples/agent-adapters`](../../examples/agent-adapters) in this repo
for LangChain and ElizaOS integrations built on `ArcRelayClient` — an agent
can call `x402_pay` as a tool/action to autonomously pay for whatever
external API or sub-agent capability it needs mid-run.

## Testing with real testnet USDC

See [`scripts/`](./scripts) for runnable, no-mock scripts that check your
wallet balance, deposit into the Gateway Wallet, and execute a real payment
against a real `x402Middleware` route — then poll the seller's actual
on-chain balance to prove settlement happened. This is the fastest way to
confirm the whole pipeline works with real (testnet) money, the same way it
would on mainnet.

## Testing without live funds

`x402Middleware` and `ArcRelayClient` always talk to Circle's real
facilitator API — there's no built-in dry-run mode, by design (a "mock
that looks real" is worse than no test coverage for a payments SDK). To
develop without spending real testnet USDC:

- Point `facilitatorUrl` at a local facilitator if you're running one, or
- Use `x402ResourceServer`/`x402HTTPResourceServer` directly from
  `@x402/core` with your own in-memory `FacilitatorClient` for unit tests
  (see this package's own `test/middleware.test.ts` for a pattern that
  asserts on the 402 challenge shape without requiring a settled payment).

## Protocol version note

`@circle-fin/x402-batching@3.3.0`+ speaks x402 protocol v2: the
payment-required payload travels base64-encoded in a `PAYMENT-REQUIRED`
response header rather than the JSON body (the body itself is now
deliberately `{}`). `x402Middleware`/`ArcRelayClient` are unaffected by
this — they delegate entirely to Circle's own `gateway.require()`/
`client.pay()`, which handle both sides of the wire protocol internally.
Only code that manually inspects a raw 402 response (like this package's
own test) needs to know about the header-based v2 shape.

## License

MIT
