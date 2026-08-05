import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.ARCRELAY_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    arcTestnet: {
      // Real Arc L1 testnet RPC + chain ID, per Circle's
      // @circle-fin/x402-batching chain configs (used elsewhere in this repo).
      url: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Arc's testnet block explorer (arcscan) exposes an Etherscan-compatible
    // verification API. Set ARCSCAN_API_KEY if your instance requires one —
    // many Blockscout-based explorers accept any non-empty string.
    apiKey: {
      arcTestnet: process.env.ARCSCAN_API_KEY ?? "not-required",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: 5042002,
        urls: {
          apiURL: process.env.ARCSCAN_API_URL ?? "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
};

export default config;
