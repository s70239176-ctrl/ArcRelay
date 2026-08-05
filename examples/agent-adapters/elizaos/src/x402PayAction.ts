/**
 * src/x402PayAction.ts
 *
 * An ElizaOS `Action` that lets an agent autonomously pay for any
 * x402-protected resource via `@arcrelay/sdk`'s `ArcRelayClient` — its own
 * infrastructure, a sub-agent's paywalled API, a data provider, whatever
 * the planner decides it needs mid-conversation.
 *
 * Note on scope: `@elizaos/core` ships its own native x402 support (see
 * `X402Config`/`X402Accepts` in `@elizaos/core/dist/types/payment.d.ts`) —
 * but that's for exposing *paid routes from* an ElizaOS agent (the agent as
 * seller), with built-in presets for Base/Solana/Polygon/BSC USDC. It has
 * no built-in *buyer*-side action and no Arc L1 preset. This action fills
 * that gap: it's the ElizaOS-side buyer, paying arbitrary x402 resources
 * (on Arc L1 or any other Gateway-supported chain) via ArcRelayClient.
 */

import type {
  Action,
  ActionExample,
  ActionResult,
  Handler,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Validator,
} from "@elizaos/core";
import { ArcRelayClient, type ArcRelayClientOptions } from "@arcrelay/sdk";
import type { SupportedChainName } from "@circle-fin/x402-batching/client";

// ---------------------------------------------------------------------------
// Client cache — one ArcRelayClient (and its spend-limit state) per runtime,
// so budgets persist across calls within the same agent process.
// ---------------------------------------------------------------------------

const clientsByRuntime = new WeakMap<IAgentRuntime, ArcRelayClient>();

function getClient(runtime: IAgentRuntime): ArcRelayClient {
  const cached = clientsByRuntime.get(runtime);
  if (cached) return cached;

  const privateKey = runtime.getSetting("ARCRELAY_PRIVATE_KEY");
  if (typeof privateKey !== "string" || !privateKey) {
    throw new Error(
      "ARCRELAY_PRIVATE_KEY is not configured on this character/runtime. " +
        "Set it in your character's secrets or the process environment."
    );
  }

  const chain = (runtime.getSetting("ARCRELAY_CHAIN") as SupportedChainName | null) ?? "arcTestnet";
  const maxPerPaymentUsdc = Number(runtime.getSetting("ARCRELAY_MAX_PER_PAYMENT_USDC") ?? 0.01);
  const maxSessionUsdc = Number(runtime.getSetting("ARCRELAY_MAX_SESSION_USDC") ?? 1.0);

  const options: ArcRelayClientOptions = {
    privateKey: privateKey as `0x${string}`,
    chain,
    maxPerPaymentUsdc,
    maxSessionUsdc,
  };

  const client = new ArcRelayClient(options);
  clientsByRuntime.set(runtime, client);
  return client;
}

// ---------------------------------------------------------------------------
// Parameter extraction
// ---------------------------------------------------------------------------

interface X402PayParams {
  url: string;
  method?: "GET" | "POST";
}

function extractParams(
  message: Memory,
  options?: Record<string, unknown>
): X402PayParams | null {
  // Prefer structured options (planner-supplied), fall back to scanning the
  // message text for a URL if the planner passed the request as plain text.
  const fromOptions = options?.url;
  if (typeof fromOptions === "string" && fromOptions.length > 0) {
    return {
      url: fromOptions,
      method: options?.method === "POST" ? "POST" : "GET",
    };
  }

  const text = message.content?.text ?? "";
  const match = text.match(/https?:\/\/\S+/);
  if (match) {
    return { url: match[0], method: /\bpost\b/i.test(text) ? "POST" : "GET" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validate / Handler
// ---------------------------------------------------------------------------

const validate: Validator = async (runtime, message) => {
  // Only offer this action when a wallet is actually configured, and the
  // message plausibly references paying for a URL/resource.
  const hasWallet = Boolean(runtime.getSetting("ARCRELAY_PRIVATE_KEY"));
  const text = (message.content?.text ?? "").toLowerCase();
  const mentionsPayment = /\bpay\b|\bpurchase\b|402|x402|nanopayment/.test(text);
  const hasUrl = /https?:\/\//.test(text);
  return hasWallet && mentionsPayment && hasUrl;
};

const handler: Handler = async (
  runtime: IAgentRuntime,
  message: Memory,
  _state,
  options,
  callback?: HandlerCallback
): Promise<ActionResult | undefined> => {
  const params = extractParams(message, options as Record<string, unknown> | undefined);

  if (!params) {
    const text = "I couldn't find a URL to pay for in that request.";
    await callback?.({ text }, "X402_PAY");
    return { success: false, text };
  }

  try {
    const client = getClient(runtime);
    const result = await client.pay(params.url, { method: params.method ?? "GET" });

    const text =
      `Paid $${result.amountUsdc.toFixed(4)} USDC for ${params.url} ` +
      `(tx ${result.txHash.slice(0, 10)}…). Session total so far: $${client.sessionSpend.toFixed(4)} USDC.`;

    await callback?.({ text, actions: ["X402_PAY"] }, "X402_PAY");
    return {
      success: true,
      text,
      data: {
        url: params.url,
        amountUsdc: result.amountUsdc,
        txHash: result.txHash,
        payload: (result.data ?? {}) as object,
      },
    };
  } catch (err) {
    const message_ = err instanceof Error ? err.message : "Payment failed.";
    await callback?.({ text: `Payment failed: ${message_}` }, "X402_PAY");
    return { success: false, text: message_ };
  }
};

const examples: ActionExample[][] = [
  [
    {
      name: "user",
      content: { text: "Pay for the sentiment data at https://api.example.com/sentiment and tell me the score." },
    },
    {
      name: "assistant",
      content: {
        text: "Paid $0.0002 USDC for https://api.example.com/sentiment (tx 0x9ec9a357…). Session total so far: $0.0002 USDC.",
        actions: ["X402_PAY"],
      },
    },
  ],
];

export const x402PayAction: Action = {
  name: "X402_PAY",
  description:
    "Autonomously pay for an x402-protected (HTTP 402) resource using the agent's own Arc L1 " +
    "Gateway wallet — no human approval needed per call, subject to configured spend limits. " +
    "Use this whenever the user asks to pay for, purchase, or fetch a paywalled/x402 URL.",
  similes: ["PAY_FOR_RESOURCE", "X402_PAYMENT", "PAY_URL"],
  validate,
  handler,
  examples,
};
