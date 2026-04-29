# Polymarket Builder Integration

## Current Status

Scaffolded only. This path is **not production-live** unless all required configuration and user-owned signing/auth pieces are wired. Routed trading remains disabled by default and returns clear typed errors when dependencies are missing.

The default user-facing language is zh-HK Traditional Chinese with English fallback. External routing copy should describe the flow as non-custodial and user-signed.

## Required Environment

```env
POLY_BUILDER_CODE=
POLYMARKET_ROUTED_TRADING_ENABLED=false
```

## User-Owned Boundary (No Custody)

- User owns wallet connection and signs every order.
- User owns Polymarket L2 API credentials.
- Server accepts only order-ready payloads, does not persist private keys/secrets, and does not retain signatures beyond submission processing.
- Platform does **not** custody funds and does **not** bet on behalf of users.

## Builder Attribution

`POLY_BUILDER_CODE` is attached immediately before submission through the external route payload (`orderInput.builderCode`). Monetization attribution is only through that field on user-routed CLOB V2 orders.

## API Route and Safety

`POST /external/polymarket/orders/route`:
- guarded by `POLYMARKET_ROUTED_TRADING_ENABLED`
- requires `userWalletAddress`, `signedOrder`, `orderInput`, and `l2CredentialStatus: "present"`
- returns typed errors for disabled feature, missing builder code, invalid payload, missing user signing, missing credentials, and unavailable submitter adapter
- never imports/calls internal ledger, balance, deposits, withdrawals, claims, or matching modules

## CLOB V2 Adapter

A concrete placeholder adapter file exists for future `@polymarket/clob-client-v2` integration, but it is intentionally disabled until exact API wiring is validated.

## QA

### Feature flag OFF
1. Unset builder code or set flag false.
2. Confirm `/polymarket` stays read-only.
3. Confirm route returns disabled typed error.

### Feature flag ON (controlled environment)
1. Set valid builder code and `POLYMARKET_ROUTED_TRADING_ENABLED=true`.
2. Verify missing signing/credentials are rejected.
3. Verify successful payloads include `builderCode` before submitter invocation.
4. Verify no internal balance/ledger/deposit/withdrawal mutations occur.
