# ArcRelay API

Documentation for ArcRelay's own HTTP API — the three routes the frontend
talks to. (For the `@arcrelay/sdk` package's API — `x402Middleware`,
`ArcRelayClient` — see [`packages/sdk/README.md`](../packages/sdk/README.md)
instead; this document covers the Next.js app itself.)

All routes live under `app/api/` and run in both **mock mode** (default,
zero setup, no network calls to Circle) and **live mode**
(`ARCRELAY_PRIVATE_KEY` set — real Circle Gateway settlement on Arc L1
testnet). Every example below shows real captured output from an actual
run, labeled with which mode produced it.

---

## `POST /api/agent/orchestrate`

Server-Sent Events stream. Given a prompt, plans which sub-agent
capability nodes to dispatch, pays each one via x402, and streams
narration, execution-stage updates, terminal log entries, and settlement
events as they happen.

### Request

```http
POST /api/agent/orchestrate
Content-Type: application/json

{ "prompt": "Audit this smart contract and fetch live SEC filings for market context" }
```

### Response

`Content-Type: text/event-stream`. Five event types, in the order they
occur during a run:

| Event | When | Payload |
|---|---|---|
| `text` | Narration chunks throughout the run | Plain string |
| `step` | Once per x402 execution stage, per node | `{ stage, nodeId, timestamp }` |
| `log` | Terminal-ready log entry, per stage | `LogEntry` (see `lib/agent-types.ts`) |
| `payment` | Once a node's payment settles | `PAYMENT_EVENT` object |
| `summary` | Once, at the end of the run | Session totals |
| `done` | Once, terminates the stream | `{ ok: boolean }` |

`stage` is one of: `challenge_received`, `gateway_verification`,
`signature_generation`, `settlement`, `delivered`.

### Real captured example (mock mode)

```
event: payment
data: {"type":"PAYMENT_EVENT","nodeId":"sentiment_node","label":"SentimentPulse-Node-Beta","capability":"Market Sentiment Scoring","amountUsdc":0.0002,"chain":"ARC-TESTNET","txHash":"0x751c2f6b8b867fbdb1486bfc59dea1d4052cb0ed","latencyMs":139,"timestamp":"2026-08-05T20:39:22.942Z"}

event: summary
data: {"sessionSpend":0.0002,"gasSaved":0.0002,"nodesRun":1,"remainingBalance":14.2202}

event: done
data: {"ok":true}
```

In **live mode**, `payment.txHash` is a Gateway-internal transfer ID (a
UUID), not an on-chain hash — see the note in the SDK README's "Testing
with real testnet USDC" section for why, and don't confuse the two when
reading logs.

---

## `POST /api/v1/mock-nodes/[nodeId]`

A single sub-agent capability node, gated behind x402. `nodeId` is one of
`sec_data_node`, `sentiment_node`, `solidity_audit_node`,
`liquidity_router_node`.

### Mock mode

Self-contained JSON-body 402 challenge/response — no network calls to
Circle. Real captured example:

**Request with no payment:**
```http
POST /api/v1/mock-nodes/sentiment_node
```

**Response:**
```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "Payment Required",
  "accepts": [{
    "scheme": "exact",
    "network": "arc-testnet",
    "maxAmountRequired": "200",
    "resource": "/api/v1/mock-nodes/sentiment_node",
    "description": "Market Sentiment Scoring",
    "payTo": "0x9E4c1F3aA7d02B6e8C5f10D4b3A9e7C2F1a8B6D5",
    "asset": "0x3600000000000000000000000000000000000000"
  }]
}
```

Resend with an `X-PAYMENT` header carrying a signed authorization JSON to
get a `200` with the node's result payload.

### Live mode

Requests are processed by a real `x402HTTPResourceServer` backed by
Circle's `BatchFacilitatorClient` (see `lib/x402-server.ts`) — genuine x402
**v2** protocol: the payment-required payload is base64-encoded in a
`PAYMENT-REQUIRED` response header, and the JSON body is deliberately `{}`.
See `@arcrelay/sdk`'s README ("Protocol version note") for the decoding
details if you're inspecting this by hand.

---

## `GET /api/agent/wallet`

Returns the orchestrator's current wallet + Gateway balance breakdown.
Added specifically so the dashboard reflects real state in live mode
instead of only ever showing client-simulated numbers.

### Real captured example (mock mode)

```json
{
  "address": "0x7A3f9C2eE1B8D4a5F60127E4d9C3aA1b8E5c0F42",
  "chain": "ARC-TESTNET",
  "mode": "mock",
  "wallet": { "usdc": 14.2204, "formatted": "14.2204" },
  "gateway": {
    "total": 1,
    "available": 1,
    "withdrawing": 0,
    "withdrawable": 0,
    "formattedTotal": "1.0000",
    "formattedAvailable": "1.0000",
    "formattedWithdrawing": "0.0000",
    "formattedWithdrawable": "0.0000"
  },
  "fetchedAt": "2026-08-07T01:13:34.222Z"
}
```

`wallet.usdc` is the plain EOA USDC balance; `gateway.available` is what's
actually spendable via x402 right now (deposited into the Gateway Wallet,
not yet spent or withdrawing). This is the same distinction confirmed by
real testnet testing: a successful payment debits `gateway.available`
immediately, while the actual on-chain transfer to the seller follows
Circle's own batch settlement cadence separately.

In live mode this calls `GatewayClient.getBalances()` directly — real
on-chain + Gateway API state, not simulated.

### Error response

```json
{ "error": "<message>", "mode": "live" }
```

with HTTP `500`, if the underlying Gateway call fails (e.g. network
issues, misconfigured key).
