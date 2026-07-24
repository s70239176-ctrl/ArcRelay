# ArcRelay

AI Agent Execution Workbench powered by **Circle Agent Stack** and **Arc L1**
(Circle's EVM chain with native USDC gas). ArcRelay orchestrates multiple
sub-agent capability nodes, pays each one per-call via Circle's **x402**
micropayment protocol, and streams the whole run — narration + settlements —
to the browser over Server-Sent Events.

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

Edit `.env.local` (or Codespaces → **Settings → Secrets**) with real Circle
Developer-Controlled Wallets credentials for Arc L1 testnet:

```bash
ARCRELAY_FORCE_MOCK=0
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
ARC_USDC_ADDRESS=0x...          # USDC contract address on Arc L1
ARCRELAY_SELLER_ADDRESS=0x...   # payee wallet for mock sub-agent nodes
```

`lib/circle-agent-wallet.ts` auto-detects credentials and switches from
`mock` to `live` mode with no other code changes.

## Architecture

- `app/page.tsx` — main workbench UI, SSE client, settlement tape state.
- `app/api/agent/orchestrate/route.ts` — orchestrator SSE route; plans
  capability nodes, drives each x402 handshake, streams text + `PAYMENT_EVENT`
  chunks.
- `app/api/v1/mock-nodes/[nodeId]/route.ts` — sub-agent endpoints implementing
  the HTTP 402 challenge/response cycle (`withGateway`-wrapped for Circle
  Gateway off-chain batch settlement).
- `lib/circle-agent-wallet.ts` — Agent Wallet init, USDC balance reads, and
  x402 payload signing (mock + live paths).

## References

- Circle Developer Hub — https://developers.circle.com/
- Circle Agent Stack — https://developers.circle.com/agent-stack
- x402 protocol — https://github.com/circlefin/x402
- Arc L1 testnet explorer — https://arc-testnet.explorer.circle.com/
