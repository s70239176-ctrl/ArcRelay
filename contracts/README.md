# @arcrelay/contracts

`ArcRelaySettlementRegistry` — an on-chain, EIP-712-signed audit trail for
x402 nanopayments settled through ArcRelay. Circle Gateway moves the USDC;
this contract gives ArcRelay its own permanent, independently verifiable
record of which agent wallet paid which resource how much, without anyone
having to trust ArcRelay's backend to have logged it honestly.

## Status

- ✅ Compiles against the real Solidity 0.8.24 compiler (Cancun EVM target).
- ✅ Full test suite (5 tests: valid settlement + event emission, nonce
  replay rejection, wrong-signer rejection, expiry rejection, multi-payer
  totals) passes against Hardhat's local EVM with the actual compiled
  bytecode.
- ✅ **Deployed and verified on Arc L1 testnet:**
  - Address: [`0x9289A359b8528D407Bd69d49d43EB1d5a76ACE8a`](https://testnet.arcscan.app/address/0x9289A359b8528D407Bd69d49d43EB1d5a76ACE8a#code)
  - Deployment tx: `0xd70188b35651405b60147e335c9451b2587d55013f22e2590bb8919b2813f781`
  - Source verified on Arcscan — the `#code` link above shows the real Solidity source matched against the deployed bytecode.

## Compile & test

```bash
npm install
npm run compile
npm test
```

> **Sandboxed dev environments:** if `npx hardhat compile` fails with
> `HH502` / "Host not in allowlist: binaries.soliditylang.org", your
> environment is blocking Hardhat's compiler download (this happens in some
> restricted CI/dev sandboxes — it will *not* happen in a normal Codespace
> with full internet access). Use the sandbox-friendly script aliases
> instead, which pre-seed Hardhat's compiler cache from the `solc` npm
> package (reachable via the npm registry) instead of downloading a native
> binary from the blocked host:
> ```bash
> npm run compile:sandbox
> npm run test:sandbox
> ```
> You shouldn't need these in a Codespace — try the plain `npm run compile`
> first.

## Deploy to Arc L1 testnet

1. Get an EVM private key and fund it with testnet gas from
   https://faucet.circle.com (Arc L1 uses native USDC gas).
2. Create `contracts/.env`:
   ```bash
   ARCRELAY_PRIVATE_KEY=0x...
   # Optional overrides:
   # ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
   # ARCSCAN_API_KEY=...
   ```
3. Deploy:
   ```bash
   npm run deploy:arc-testnet
   ```
   This prints the deployed address, the deployment tx hash, and a direct
   link to `https://testnet.arcscan.app/address/<address>`.
4. Verify the source on Arcscan:
   ```bash
   npm run verify:arc-testnet -- <deployed-address>
   ```
   Arc's testnet explorer exposes an Etherscan-compatible verification API;
   `hardhat.config.ts` is pre-wired for it via `customChains`. This is
   confirmed working — see the reference deployment above.

The reference deployment above was produced exactly this way; redeploying
gives you your own independent instance at a different address (the
contract has no constructor args, so any deployer can run one).

## Contract overview

```solidity
struct Settlement {
    address payer;      // agent wallet that made the payment
    address payee;      // sub-agent node / seller that received it
    uint256 amount;      // USDC atomic units (6 decimals)
    bytes32 resourceId;  // keccak256 of the resource path/nodeId
    uint256 nonce;        // per-payer replay-protection nonce
    uint256 deadline;     // signature expiry (unix seconds)
}

function recordSettlement(Settlement calldata s, bytes calldata signature)
    external returns (bytes32 settlementId);
```

Anyone holding a valid EIP-712 signature from `s.payer` can submit it —
the signature is what's trusted, not the caller, so ArcRelay's orchestrator
or a sub-agent node can both log settlements without either being a
privileged on-chain role.

## License

MIT
