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
- ⬜ **Not deployed anywhere yet.** Deploying requires a funded testnet key
  and outbound network access to Arc's RPC — see below to do it yourself.

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
   `hardhat.config.ts` is pre-wired for it via `customChains`. If
   verification fails, double check `ARCSCAN_API_URL`/`ARCSCAN_API_KEY`
   against whatever Arcscan currently documents — that endpoint shape
   wasn't something I could confirm from this environment (no network
   access to arcscan.app here), so treat it as a starting point, not a
   guarantee.

Once deployed, drop the real address + explorer link into the main repo
README's grant-facing summary — don't leave a placeholder there.

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
