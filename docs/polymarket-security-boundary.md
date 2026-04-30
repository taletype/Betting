# Polymarket Security Boundary

## Custody Boundary

The app does not custody user Polymarket funds. Users connect their own wallet, authorize their own Polymarket order, and keep control of funds and approvals in their wallet and Polymarket account.

Required user-facing copy:

```text
交易會透過 Polymarket 執行。本平台只提供市場資料、下單介面及路由，不持有你的 Polymarket 資金。
```

```text
費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。
```

## Credential Boundary

The backend must never receive or store raw private keys. It must not ask users to paste private keys. It must not use platform-owned trading credentials for user orders.

Allowed:

- User-owned wallet signatures.
- User-owned Polymarket L2 credentials scoped to that user.
- Safe audit metadata after a user-signed submit.

Not allowed:

- Server-side signing of user orders.
- Raw user private keys in database, local storage, logs, or environment files.
- Platform-owned Polymarket L2 credentials placing user orders.
- Logging signatures, private keys, API secrets, passphrases, or auth headers.

## Internal Balance Boundary

Polymarket routed activity must not import or mutate:

- internal trading balances
- ledger journals or entries
- matching engine state
- deposits or withdrawals
- claims
- automatic payout execution

The routed-order audit table is separate from internal balances. It stores only safe metadata such as user ID, external market ID, token ID, side, price, size, notional, Builder Code attached status, Polymarket order ID if returned, referral attribution ID if present, and timestamp.

## Reward Boundary

Referral attribution is direct and metadata-only until confirmed Builder-fee revenue exists. Payout remains manual and admin-approved. The system must not create recursive reward trees or automatic crypto payout execution.

## Production Review Checklist

Before enabling live submit:

1. Confirm official Polymarket SDK/client path constructs and signs orders in the user-owned wallet context.
2. Confirm L2 credentials are user-owned, scoped to the user, encrypted if persisted, and never logged.
3. Confirm geoblock check uses the user browser/session context and is not bypassed.
4. Confirm `POLY_BUILDER_CODE` is attached before signing and validated before submit.
5. Confirm submitter never signs user orders.
6. Confirm routed Polymarket routes do not import internal balance or ledger mutation modules.
7. Confirm audit rows contain no secrets and no full signatures.
8. Confirm payouts remain manual and admin-approved.
9. Confirm `POLYMARKET_ROUTED_TRADING_ENABLED=false` remains the default in examples and deployment templates.

## Server-Side Geoblock Boundary

Browser geoblock checks are UX-only. A live routed order must be blocked unless a fresh server-side geoblock proof verifier confirms the user is not restricted. Missing, stale, browser-only, or unverifiable geoblock payloads fail closed.

The Polymarket preflight audit documents this boundary for operators and keeps live trading disabled when signature, credential, geoblock, submitter, or audit gates are missing.
