# Test scripts

Real, no-mock scripts for exercising `@arcrelay/sdk` with actual testnet
USDC on Arc L1. Every one of these makes genuine network calls to Circle
Gateway and Arc's RPC — nothing here is simulated.

## `check-balance.ts`

Prints your wallet's address and USDC balance.

```bash
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/check-balance.ts
```

## `deposit.ts`

Moves USDC from your plain wallet balance into the Gateway Wallet balance —
a one-time on-chain step required before any x402 payment can settle.
Get testnet USDC into your plain wallet first via https://faucet.circle.com.

```bash
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/deposit.ts 1.00
```

The argument is the amount in whole USDC (defaults to `1.00`).

## `pay-demo.ts`

The full real thing: spins up a live `x402Middleware`-protected Express
route, pays it with a real `ArcRelayClient`, and polls the seller's actual
on-chain USDC balance (a plain ERC-20 `balanceOf` read, independent of
anything the SDK itself reports) until it visibly increases — proof that
real money moved, not just that an API call returned success.

```bash
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/pay-demo.ts [priceUsdc] [sellerAddress]
```

- `priceUsdc` defaults to `0.01`.
- `sellerAddress` defaults to a freshly generated throwaway address if
  omitted, so you can watch its balance go from exactly `0` to something —
  the clearest possible proof this isn't just talking to itself. Pass your
  own address if you want the funds to go somewhere you control instead.

Gateway settlement is *batched*: the payment call resolving successfully
means Circle verified and accepted it, not necessarily that the on-chain
transfer has landed yet. The script polls for up to 60 seconds; if the
balance hasn't moved by then, check the printed explorer link directly —
it's very likely just batching latency, not a failure.

## Order of operations

```bash
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/check-balance.ts      # confirm your wallet has USDC
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/deposit.ts 1.00       # move it into the Gateway Wallet
ARCRELAY_PRIVATE_KEY=0x... npx tsx scripts/pay-demo.ts 0.01      # pay for real, watch it settle
```
