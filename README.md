<<<<<<< HEAD
# ArcRelay

AI Agent Execution Workbench powered by **Circle Agent Stack** and **Arc L1**
(Circle's EVM chain with native USDC gas). ArcRelay orchestrates multiple
sub-agent capability nodes, pays each one per-call via Circle's **x402**
micropayment protocol, and streams the whole run — narration + settlements —
to the browser over Server-Sent Events.

This repo is more than the demo app — it's three independently useful
pieces built on Circle's real `@circle-fin/x402-batching` SDK:

| | What it is | Status |
|---|---|---|
| [`packages/sdk`](./packages/sdk) | `@arcrelay/sdk` — one-line Express middleware (`x402Middleware`) to paywall any route, and `ArcRelayClient` for agents to pay for resources with spend-limit guardrails | Built, tested, and **exercised with real testnet USDC** — a real deposit + payment genuinely debited by Circle Gateway (see [`packages/sdk/README.md`](./packages/sdk/README.md#testing-with-real-testnet-usdc)) |
| [`contracts`](./contracts) | `ArcRelaySettlementRegistry.sol` — an EIP-712 on-chain settlement audit trail, independent of Circle Gateway's own settlement | Compiled + tested (5/5 passing) and **deployed + verified on Arc L1 testnet**: [`0x9289A359b8528D407Bd69d49d43EB1d5a76ACE8a`](https://testnet.arcscan.app/address/0x9289A359b8528D407Bd69d49d43EB1d5a76ACE8a#code) |
| [`examples/agent-adapters`](./examples/agent-adapters) | LangChain tool + ElizaOS action letting an agent autonomously pay for its own infrastructure via `@arcrelay/sdk` | Built, both verified against a real `x402Middleware`-protected route |

Each has its own README with exact commands. Every checkmark above was
independently reproduced end to end — including a live contract
deployment and a real testnet-USDC payment genuinely debited by Circle
Gateway — not just claimed.

## Getting started in a Codespace

This repo is set up to run in **GitHub Codespaces** with zero manual steps:

1. Push/unpack this repo to GitHub (or open it directly if already there).
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for the container to build — `.devcontainer/setup.sh` runs
   automatically: it installs dependencies and creates `.env.local` from
   `.env.example` (mock mode on by default).
4. Once it's ready, run:

   ```bash
   npm run dev
   ```

5. Codespaces will forward port `3000` and prompt you to open it in a
   preview tab/browser.

The app works fully **without any API keys** in mock mode: the Agent Wallet,
USDC balance, and x402 signatures are all synthesized locally so you can
exercise the entire 402 handshake → settlement-tape flow offline — no
network access to Circle's APIs required.

### Running locally instead of in a Codespace

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Going live

ArcRelay's live mode uses Circle's real `@circle-fin/x402-batching` SDK end
to end — a real `GatewayClient` on the buyer (orchestrator) side and a real
`x402ResourceServer` + `BatchFacilitatorClient` on the seller (sub-agent
node) side, settling genuine nanopayments via Circle Gateway on Arc L1
testnet.

1. Get an EVM private key and fund it with testnet USDC from
   https://faucet.circle.com.
2. Deposit that USDC into the Gateway Wallet (one time):
   ```ts
   import { GatewayClient } from "@circle-fin/x402-batching/client";
   const client = new GatewayClient({ chain: "arcTestnet", privateKey: "0x..." });
   await client.deposit("5.00");
   ```
3. Set these in `.env.local` (or Codespaces → **Settings → Secrets**):
   ```bash
   ARCRELAY_FORCE_MOCK=0
   ARCRELAY_PRIVATE_KEY=0x...          # the funded/deposited key from step 1-2
   ARCRELAY_SELLER_ADDRESS=0x...       # payee wallet for the sub-agent nodes
   ```

`lib/circle-agent-wallet.ts` auto-detects `ARCRELAY_PRIVATE_KEY` and
switches from `mock` to `live` mode with no other code changes — the
orchestrator then calls the real `GatewayClient.pay()` against each node,
and `app/api/v1/mock-nodes/[nodeId]/route.ts` verifies/settles those
payments through Circle Gateway's testnet API
(`gateway-api-testnet.circle.com`) via `lib/x402-server.ts`.

## Design system

The UI is built to [`DESIGN.md`](./DESIGN.md) — a warm-canvas editorial
system (cream canvas, coral primary CTA, dark-navy product surfaces,
slab-serif display type). Tokens are wired as CSS custom properties in
`app/globals.css` and exposed as Tailwind theme colors/radii in
`tailwind.config.ts` (`bg-canvas`, `text-primary`, `bg-surface-dark`, etc.).
The relayer log terminal is treated as the system's `code-window-card` — a
dark product surface — while the rest of the console stays on the cream
canvas, with coral reserved for the single "Execute Agent" primary action.

Display/body fonts use DESIGN.md's own documented open-source substitutes
(Cormorant Garamond / EB Garamond for the licensed Copernicus serif, Inter
for the licensed StyreneB sans) as local CSS stacks rather than a
`next/font/google` fetch, so the app builds and renders correctly without
network access to a font CDN.

See [`docs/API.md`](./docs/API.md) for the app's own API routes — request/
response shapes with real captured examples for both mock and live mode.

## Architecture

- `app/page.tsx` — renders `ArcRelayDashboard`.
- `components/ArcRelayDashboard.tsx` — dashboard shell: sticky control header
  with live network telemetry (block height, finality, gateway liquidity,
  relayer health), responsive two-pane layout, mobile slide-over log drawer,
  and sticky mobile action bar.
- `components/x402ExecutionPanel.tsx` — agent archetype selector, prompt
  input, per-call spend-limit slider, and the live 5-stage execution
  workflow visualizer (`402 Challenge → Gateway Verification → Signature
  Generation → Arc L1 Settlement → Delivered`), with settlement toasts.
- `components/AgentTerminal.tsx` — streaming log terminal with category
  filters (`All` / `x402` / `Gateway` / `Relayer` / `Errors`), color-coded
  status badges, and an expandable JSON payload inspector with
  copy-to-clipboard.
- `app/api/agent/orchestrate/route.ts` — orchestrator SSE route; plans
  capability nodes, drives each x402 handshake, and streams `text`, `step`
  (workflow stage), `log` (structured terminal entries), `payment`, and
  `summary` events.
- `app/api/v1/mock-nodes/[nodeId]/route.ts` — sub-agent endpoints implementing
  the HTTP 402 challenge/response cycle (`withGateway`-wrapped for Circle
  Gateway off-chain batch settlement).
- `app/api/agent/wallet/route.ts` — exposes the real wallet + Gateway
  balance breakdown to the dashboard header.
- `lib/circle-agent-wallet.ts` — Agent Wallet init, USDC balance reads, and
  x402 payload signing (mock + live paths).
- `lib/agent-types.ts` — shared types for log entries, execution stages, and
  agent archetypes used by both the API route and the UI components.
- `packages/sdk/` — `@arcrelay/sdk`, the standalone middleware/client
  package (see its own README).
- `contracts/` — `ArcRelaySettlementRegistry.sol` and its Hardhat project
  (see its own README).
- `examples/agent-adapters/` — LangChain and ElizaOS integrations built on
  `@arcrelay/sdk` (each with its own README).

## References

- Circle Developer Hub — https://developers.circle.com/
- Circle Agent Stack — https://developers.circle.com/agent-stack
- x402 protocol — https://github.com/circlefin/x402
- Arc L1 testnet explorer — https://arc-testnet.explorer.circle.com/
=======
# ArcRelay
>>>>>>> cf612837d0c4b7b0f350764ce9f4b73df34d89ab
