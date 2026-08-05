/**
 * src/client.ts
 *
 * `ArcRelayClient` — the buyer side of the SDK. A thin wrapper over
 * Circle's real `GatewayClient` (from `@circle-fin/x402-batching/client`)
 * that adds spend-limit guardrails via its documented lifecycle hooks —
 * useful default behavior for autonomous agents that shouldn't need a
 * human in the loop to approve every nanopayment, but also shouldn't be
 * able to blow through a budget on a bad prompt.
 */

import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";

export interface ArcRelayClientOptions {
  /** EVM private key for the agent's buyer wallet. */
  privateKey: Hex;
  /** Chain to pay on. Defaults to Arc L1 testnet. */
  chain?: SupportedChainName;
  /**
   * Hard ceiling per individual payment, in whole USDC (e.g. `0.01`). Any
   * `pay()` call whose resolved price exceeds this throws before a
   * signature is ever created — the guardrail lives on the buyer side, not
   * the seller side, so it holds regardless of what a given endpoint asks.
   */
  maxPerPaymentUsdc?: number;
  /** Optional running-session budget, in whole USDC. Cumulative across `pay()` calls on this client instance. */
  maxSessionUsdc?: number;
}

export interface PayResult {
  data: unknown;
  amountUsdc: number;
  txHash: string;
}

export class ArcRelayClient {
  private readonly gateway: GatewayClient;
  private readonly maxPerPaymentUsdc?: number;
  private readonly maxSessionUsdc?: number;
  private sessionSpendUsdc = 0;

  constructor(options: ArcRelayClientOptions) {
    this.gateway = new GatewayClient({
      chain: options.chain ?? "arcTestnet",
      privateKey: options.privateKey,
    });
    this.maxPerPaymentUsdc = options.maxPerPaymentUsdc;
    this.maxSessionUsdc = options.maxSessionUsdc;

    if (this.maxPerPaymentUsdc !== undefined) {
      this.gateway.onBeforePaymentCreation(async (ctx) => {
        const amountUsdc = Number(ctx.selectedRequirements.amount) / 1_000_000;
        if (amountUsdc > this.maxPerPaymentUsdc!) {
          return {
            abort: true,
            reason: `Payment of $${amountUsdc.toFixed(4)} exceeds per-payment limit of $${this.maxPerPaymentUsdc!.toFixed(4)}.`,
          };
        }
        return undefined;
      });
    }
  }

  /** Wallet address this client pays from. */
  get address(): `0x${string}` {
    return this.gateway.address;
  }

  /** One-time (or top-up) deposit into the Gateway Wallet balance. */
  async deposit(amountUsdc: string): Promise<void> {
    await this.gateway.deposit(amountUsdc);
  }

  /** Current USDC wallet balance, formatted to a decimal string. */
  async getBalance(): Promise<{ usdc: number; formatted: string }> {
    const { formatted } = await this.gateway.getUsdcBalance();
    return { usdc: Number(formatted), formatted };
  }

  /**
   * Pays for an x402-protected resource end to end — handles the 402
   * challenge, Gateway verification, EIP-712/EIP-3009 signature, and
   * settlement via `GatewayClient.pay()`. Enforces `maxSessionUsdc` (a
   * client-side running total) in addition to the per-payment hook set up
   * in the constructor.
   */
  async pay(
    url: string,
    opts: { method?: "GET" | "POST"; body?: unknown } = {}
  ): Promise<PayResult> {
    if (this.maxSessionUsdc !== undefined && this.sessionSpendUsdc >= this.maxSessionUsdc) {
      throw new Error(
        `ArcRelayClient: session budget of $${this.maxSessionUsdc.toFixed(4)} USDC already spent.`
      );
    }

    const result = await this.gateway.pay(url, { method: opts.method ?? "GET", body: opts.body });
    const amountUsdc = Number(result.formattedAmount);

    if (this.maxSessionUsdc !== undefined && this.sessionSpendUsdc + amountUsdc > this.maxSessionUsdc) {
      throw new Error(
        `ArcRelayClient: payment of $${amountUsdc.toFixed(4)} would exceed session budget of $${this.maxSessionUsdc.toFixed(4)} USDC.`
      );
    }
    this.sessionSpendUsdc += amountUsdc;

    return { data: result.data, amountUsdc, txHash: result.transaction };
  }

  /** Total USDC spent by this client instance so far. */
  get sessionSpend(): number {
    return this.sessionSpendUsdc;
  }
}
