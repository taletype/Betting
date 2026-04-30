# Polymarket Live Trading Readiness

Live routed trading is disabled by default:

```env
POLYMARKET_ROUTED_TRADING_ENABLED=false
POLY_BUILDER_CODE=
POLYMARKET_CLOB_SUBMITTER=disabled
```

The current implementation is production-safe for browsing and order preview only. Live submit must remain disabled until a production-reviewed user-owned signing flow and Polymarket L2 credential manager exist.

## Readiness Gates

The `透過 Polymarket 交易` action may submit only when every gate is true:

1. User is logged in.
1a. Login is verified by Supabase Auth on the server; spoofed identity headers are ignored.
2. User wallet is connected and linked to the account.
3. Browser/session geoblock check reports the user is not restricted.
4. User-owned Polymarket L2 credentials are present.
5. User-owned order signing is available.
6. `POLY_BUILDER_CODE` is configured.
7. `POLYMARKET_ROUTED_TRADING_ENABLED=true`.
8. Market is active and tradable.
9. Token ID and outcome mapping are valid.
10. Price, size, side, tick size, minimum size, order type, expiration, and slippage guard are valid.
11. Polymarket submitter is available.
12. No internal ledger or balance module is imported by routed Polymarket routes.
13. User sees final confirmation and signs the order.

## Disabled Reasons

User-facing disabled reasons are Traditional Chinese:

- `尚未登入`
- `需要登入後才可準備交易。`
- `尚未連接錢包`
- `你目前所在地區暫不支援 Polymarket 下單`
- `需要 Polymarket 憑證`
- `需要用戶自行簽署訂單`
- `Builder Code 未設定`
- `交易功能尚未啟用`
- `市場暫時不可交易`
- `價格或數量無效`
- `提交器暫時不可用`

## Current Blocker

The repository does not currently include a production-safe user-owned Polymarket L2 credential flow. The default backend credential lookup returns `missing`, and the server submitter refuses to sign user orders. This is intentional.

Routed submit also requires verified Supabase Auth identity before any trading-readiness checks continue. Missing auth returns `401` and does not evaluate body-supplied user identifiers.

Missing work before enabling live submit:

- Browser wallet flow that constructs the Polymarket order with official SDK primitives.
- User-owned L2 credential creation or derivation scoped to the user.
- Storage design that never stores raw private keys and never logs L2 secrets.
- Signature verification proving the signed order signer matches the linked wallet.
- Production review of geoblock, CSRF, rate limit, and audit paths.

## Enablement Rule

Only after production safety review:

1. Configure the Builder Code in the secret store.
2. Deploy the user-owned signing and L2 credential manager.
3. Set `POLYMARKET_CLOB_SUBMITTER=real` in staging first.
4. Run order preview and signed-order submit smoke tests.
5. Confirm audit rows contain only safe metadata.
6. Set `POLYMARKET_ROUTED_TRADING_ENABLED=true`.

References:

- [Polymarket order creation](https://docs.polymarket.com/developers/CLOB/orders/create-order)
- [Polymarket geographic restrictions](https://docs.polymarket.com/api-reference/geoblock)
- [Polymarket Builder order attribution](https://docs.polymarket.com/developers/builders/order-attribution)

## Preflight Audit

Live trading remains disabled until the admin preflight shows every blocking gate as passing. Required gates include production user-owned order signature verification, user-scoped L2 credential lookup, server-side geoblock proof verification, Builder code attached before user signing, submitter health, and routed-order audit recording.

The preflight is explanatory only. It does not enable `POLYMARKET_ROUTED_TRADING_ENABLED`, does not submit orders, and must not use platform-owned credentials for user trades.
