/**
 * src/plugin.ts
 *
 * The ElizaOS `Plugin` bundling ArcRelay's buyer-side x402 action. Register
 * it on a character/runtime like any other plugin:
 *
 *   import { arcRelayPlugin } from "@arcrelay/elizaos-plugin";
 *
 *   export const character: Character = {
 *     name: "MyAgent",
 *     plugins: ["@elizaos/plugin-bootstrap", "@arcrelay/elizaos-plugin"],
 *     settings: {
 *       secrets: {
 *         ARCRELAY_PRIVATE_KEY: process.env.ARCRELAY_PRIVATE_KEY,
 *       },
 *     },
 *   };
 */

import type { Plugin } from "@elizaos/core";
import { x402PayAction } from "./x402PayAction.js";

export const arcRelayPlugin: Plugin = {
  name: "@arcrelay/elizaos-plugin",
  description:
    "Lets an ElizaOS agent autonomously pay for x402-protected resources on Arc L1 (or any " +
    "Circle Gateway-supported chain) via ArcRelayClient — buyer-side nanopayments for agent infra.",
  actions: [x402PayAction],
};

export { x402PayAction } from "./x402PayAction.js";
export default arcRelayPlugin;
