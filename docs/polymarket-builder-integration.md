# Polymarket Builder Integration

## What The Builder Code Does

Polymarket CLOB V2 attributes routed orders by putting a public `bytes32` builder code on the order payload as `builderCode`. The official docs say the V2 SDK serializes that value into the signed order's onchain `builder` field; there are no legacy builder HMAC headers or separate builder signing SDK in the CLOB V2 order path.

Official references:
- [Builder Code](https://docs.polymarket.com/builders/api-keys)
- [Order Attribution](https://docs.polymarket.com/trading/orders/attribution)
- [Builder Fees](https://docs.polymarket.com/builders/fees)
- [Migrating to CLOB V2](https://docs.polymarket.com/v2-migration)
- [L2 Methods](https://docs.polymarket.com/trading/clients/l2)

## Configuration

Set `POLY_BUILDER_CODE` in server/runtime environments:

```env
POLY_BUILDER_CODE=0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca
POLYMARKET_ROUTED_TRADING_ENABLED=false
```

`POLY_BUILDER_CODE` is validated as a `0x`-prefixed bytes32 hex string. If it is missing, external Polymarket market data continues to load read-only, but routed trading remains disabled.

`POLYMARKET_ROUTED_TRADING_ENABLED` is the explicit feature flag for the scaffolded routing endpoint. It defaults to `false`.

## Fee Awareness

The intended starting Builder settings are:

- Taker fee: `0.25%` (`25 bps`)
- Maker fee: `0%` (`0 bps`)

Those rates are configured in Polymarket Builder settings, not in this app. This app only attaches `POLY_BUILDER_CODE` for attribution. Do not add local fee calculation unless the official CLOB V2 SDK/API requires a field.

## Non-Custodial Boundary

This path must remain non-custodial:

- The app does not hold Polymarket user funds.
- The app does not place bets for users.
- The app does not pool funds.
- External Polymarket market data stays read-only in our internal market views.
- External Polymarket activity must not mutate internal balances, ledger journals, deposits, withdrawals, claims, or positions.
- Users must sign/authorize their own Polymarket orders.

## Current Implementation State

Implemented:

- `@bet/integrations` exposes `getPolymarketBuilderCode()`, `assertPolymarketBuilderConfigured()`, and `attachBuilderCodeToOrder(orderInput)`.
- `services/api` exposes a clearly separate scaffold route: `POST /external/polymarket/orders/route`.
- The route attaches `builderCode` before calling an injected submitter.
- Production submission is not wired yet; without a submitter, the route returns `501 POLYMARKET_USER_SIGNING_NOT_WIRED`.
- The web Market Research page shows a disabled `Trade via Polymarket` CTA for Polymarket rows only when `POLY_BUILDER_CODE` is configured.

Not implemented yet:

- User-owned Polymarket wallet signing flow.
- User-owned Polymarket L2 API credential handoff.
- Actual `@polymarket/clob-client-v2` submission from the app.
- Any production order ticket for external Polymarket orders.

## Manual QA

1. Start with no `POLY_BUILDER_CODE`.
2. Load `/external-markets` and confirm read-only external markets still render.
3. Confirm no `Trade via Polymarket` CTA is shown.
4. Set a valid `POLY_BUILDER_CODE` and keep `POLYMARKET_ROUTED_TRADING_ENABLED=false`.
5. Reload `/external-markets` and confirm Polymarket rows show a disabled `Trade via Polymarket` CTA.
6. Call `POST /external/polymarket/orders/route` with an `orderInput` object and confirm it returns disabled while the feature flag is false.
7. Set `POLYMARKET_ROUTED_TRADING_ENABLED=true` in a non-production test environment and call the route again. Confirm it returns `501 POLYMARKET_USER_SIGNING_NOT_WIRED` until the user signing/API credential flow is implemented.
8. Confirm no internal ledger, balance, deposit, withdrawal, claim, matching, or position records change during those checks.
