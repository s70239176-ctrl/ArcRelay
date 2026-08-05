# @arcrelay/langchain-adapter

A real LangChain [`tool()`](https://js.langchain.com/docs/how_to/custom_tools/)
that lets an agent autonomously pay for x402-protected resources —
including its own infrastructure — via `@arcrelay/sdk`'s `ArcRelayClient`.

## Install

```bash
npm install @arcrelay/langchain-adapter @langchain/core
```

(In this repo it's wired to the local `@arcrelay/sdk` via a `file:` link —
see `package.json`.)

## Usage

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "langchain/agents";
import { createX402PayTool } from "@arcrelay/langchain-adapter";

const payTool = createX402PayTool({
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  chain: "arcTestnet",
  maxPerPaymentUsdc: 0.01, // hard ceiling per call
  maxSessionUsdc: 1.0,     // running budget for this agent's lifetime
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
  tools: [payTool],
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content:
        "Pay for sentiment data at https://your-x402-protected-api.com/sentiment and summarize it.",
    },
  ],
});
```

The model decides when to call `x402_pay` — e.g. after getting a 402 from
some other tool call, or because it already knows a resource needs payment.
Every call goes through `ArcRelayClient`'s real spend-limit hooks, so the
agent can act autonomously without a human approving each nanopayment,
while still being unable to exceed the budget you configured.

> **Important:** `ArcRelayClient` speaks the real x402 protocol (a
> header-based 402 challenge). It only works against genuinely
> x402-protected endpoints — e.g. anything wrapped in `x402Middleware` from
> `@arcrelay/sdk`, or the main ArcRelay app's `/api/v1/mock-nodes/*` routes
> when that app is running in **live mode**. It will *not* work against
> those same routes in the app's default **mock mode**, which intentionally
> uses a simplified JSON-body 402 (no network calls to Circle) to stay
> runnable with zero setup — see the root repo's README.

## Run the standalone demo (no LLM required)

```bash
AGENT_PRIVATE_KEY=0x... npx tsx src/example.ts
```

This spins up a tiny local Express route protected by `x402Middleware`
itself, then has the `x402_pay` tool attempt to pay for it — a
self-contained demonstration of both halves of `@arcrelay/sdk` working
together, independent of the main ArcRelay app. Without `AGENT_PRIVATE_KEY`
set, it just constructs the tool and prints its name/description so you can
see the shape without needing funds. With a real, funded key it will
attempt an actual payment via Circle Gateway's testnet API — get testnet
USDC from https://faucet.circle.com and deposit it first (see the SDK
README's "Going live" instructions).

## License

MIT
