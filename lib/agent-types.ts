/**
 * lib/agent-types.ts
 *
 * Shared types for the Agent Execution Console, Terminal log stream, and
 * x402 Execution Panel. Kept framework-agnostic (no React imports) so they
 * can be reused by both client components and API route handlers.
 */

export type AgentArchetype =
  | "cross_chain_arbitrage"
  | "paywalled_data_crawler"
  | "x402_aggregator";

export const AGENT_ARCHETYPES: Record<
  AgentArchetype,
  { label: string; description: string; defaultPrompt: string }
> = {
  cross_chain_arbitrage: {
    label: "Cross-Chain Arbitrage Agent",
    description: "Scans pool depth across chains and routes for spread capture.",
    defaultPrompt:
      "Scan USDC pool depth across Arbitrum and Arc L1, execute if spread exceeds 4bps.",
  },
  paywalled_data_crawler: {
    label: "Paywalled Data Crawler",
    description: "Pays per-call for gated data endpoints via x402.",
    defaultPrompt:
      "Crawl the latest SEC 10-K risk-factor deltas and sentiment feeds behind x402 paywalls.",
  },
  x402_aggregator: {
    label: "x402 Micro-Service Aggregator",
    description: "Fans out a job across several paid capability nodes and merges results.",
    defaultPrompt:
      "Audit this contract, pull sentiment, and route liquidity — aggregate all three results.",
  },
};

/** The five canonical stages of one x402 nanopayment execution. */
export type ExecutionStage =
  | "challenge_received"
  | "gateway_verification"
  | "signature_generation"
  | "settlement"
  | "delivered";

export const EXECUTION_STAGES: { key: ExecutionStage; label: string }[] = [
  { key: "challenge_received", label: "HTTP 402 Challenge Received" },
  { key: "gateway_verification", label: "Circle Gateway Off-Chain Deposit Verification" },
  { key: "signature_generation", label: "x402 EIP-712 / EIP-3009 Signature Generation" },
  { key: "settlement", label: "Arc L1 Sub-Second Settlement / CCTP Burn & Mint" },
  { key: "delivered", label: "200 OK Payload Decrypted & Delivered" },
];

export type LogCategory = "x402" | "gateway" | "relayer" | "error";

export type LogStatus = "402_CHALLENGE" | "200_OK" | "RELAY_SUBMITTED" | "GATEWAY_BATCHED" | "ERROR";

export interface LogEntry {
  id: string;
  timestamp: string;
  category: LogCategory;
  status: LogStatus;
  nodeLabel: string;
  message: string;
  /** Structured JSON payload shown in the inspector, e.g. the x402 authorization or tx receipt. */
  payload: Record<string, unknown>;
}

export interface NetworkTelemetry {
  network: "Arc Testnet" | "Arc Mainnet";
  blockHeight: number;
  finalityMs: number;
  gatewayLiquidityUsdc: number;
  relayerNodesActive: number;
  relayerNodesTotal: number;
}

export interface SessionMetrics {
  usdcGasBalance: number;
  gatewayPoolBalance: number;
  sessionSpentUsdc: number;
  delegatedSigningActive: boolean;
}
