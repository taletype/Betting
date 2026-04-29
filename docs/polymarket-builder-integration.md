# Polymarket Builder Integration

## Current Status

Routed trading is still **not safe to enable for production**. The API now contains a real `@polymarket/clob-client-v2` submitter adapter, but the default path remains disabled because the product has not yet shipped secure user L2 credential storage/derivation or end-to-end browser order signing verification.

Public Polymarket browsing and Builder reward accounting can remain live independently of order submission.

Read-only public pages use `GET /external/markets` and detail/orderbook/trades companions. These routes may serve existing persisted sync rows or official/public Polymarket Gamma fallback data. They must never scrape Polymarket and must not require login.

## Environment

```env
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLY_BUILDER_CODE=
POLYMARKET_ROUTED_TRADING_ENABLED=false
POLYMARKET_CLOB_SUBMITTER=disabled
```

Do not configure platform-owned Polymarket trading credentials. User trades must use user-owned wallet signing and user-owned L2 credentials only.

## Builder Attribution

CLOB V2 builder attribution is part of the signed order. `POLY_BUILDER_CODE` must be included in `orderInput.builderCode` before the user signs, and the submitted signed order must contain the same value in the signed V2 `builder` field.

The route rejects orders when:

- `orderInput.builderCode` is missing.
- `signedOrder.builder` does not equal `POLY_BUILDER_CODE`.
- The user confirmation does not acknowledge Builder fee attribution.

Do not attach `builderCode` after a user signature has already been produced.

## User-Owned Boundary

- Supabase Auth is the app identity source of truth; Thirdweb wallet connection alone is not app login or admin identity.
- Thirdweb funding can prepare user-controlled wallet funds but must not create internal balances or trading ledger entries.
- The authenticated user must have a linked wallet.
- The request wallet, linked wallet, and signed order `signer` must match.
- A server-side signature verifier must validate the signed Polymarket V2 order before submission.
- The user must explicitly confirm side, token ID, outcome, price, size or amount, order type, expiration, and Builder fee attribution.
- L2 credentials must be user-owned, server-side only, and encrypted at rest if persisted.
- The default credential lookup returns missing; no insecure credential persistence has been added.

## API Route Safety

`POST /external/polymarket/orders/route` is gated by:

- `POLYMARKET_ROUTED_TRADING_ENABLED=true`
- production or staging runtime
- `POLY_BUILDER_CODE`
- `POLYMARKET_CLOB_SUBMITTER=real`
- submitter health check
- linked wallet match
- server-side signature verification
- user L2 credentials
- open/tradable Polymarket market
- token/outcome mapping
- current CLOB tick size, negative-risk flag, and minimum size constraints
- market-order worst-price slippage guard

The external route does not import internal ledger, matching, deposit, withdrawal, claim, or portfolio mutation modules.

The UI can show the routed trade ticket shell while still reporting `實際訂單提交：已停用`. Do not label the shell as live routed trading unless the route, user-owned signing, user L2 credentials, submitter, and operational readiness are all enabled.

Chart endpoints are read-only and do not participate in Builder attribution:

- `/external/markets/:source/:externalId/history`
- `/external/markets/:source/:externalId/orderbook`
- `/external/markets/:source/:externalId/trades`
- `/external/markets/:source/:externalId/stats`

These endpoints must not require Polymarket trading credentials, must not log secrets, and must not import or mutate internal ledger/balance modules.

## Verification

Before any staging activation:

1. Confirm `.env.example` keeps `POLYMARKET_ROUTED_TRADING_ENABLED=false` and `POLYMARKET_CLOB_SUBMITTER=disabled`.
2. Confirm missing Builder Code returns `POLYMARKET_BUILDER_CODE_MISSING`.
3. Confirm `POLYMARKET_ROUTED_TRADING_ENABLED=true` without the real submitter returns `POLYMARKET_SUBMITTER_UNAVAILABLE`.
4. Confirm unsigned, stale, mismatched signer, missing L2 credential, and invalid token/outcome requests are rejected.
5. Confirm CLOB V2 order JSON contains the Builder code before signing.
6. Confirm Polymarket `OrderFilled` events show the expected `builder` bytes32 after a controlled staging trade.
7. Confirm no rows are inserted or updated in internal ledger, balance, deposit, withdrawal, matching, or claim tables.
8. Confirm reward payouts remain manual/admin-approved.
9. Confirm Thirdweb funding/provider fee records are excluded from ambassador reward splits in v1.

## Rollback

Set either value and redeploy:

```env
POLYMARKET_ROUTED_TRADING_ENABLED=false
POLYMARKET_CLOB_SUBMITTER=disabled
```

No internal balances need rollback because routed Polymarket activity must not mutate the internal ledger.
