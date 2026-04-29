# Polymarket Routed Order Flow

The routed flow keeps the user on our site while preserving user custody and user authorization.

## Preview

`POST /api/polymarket/orders/preview`:

1. Reads the logged-in session when available.
2. Validates market source, external market ID, outcome ID, and token ID.
3. Validates side, price, size or amount, order type, expiration, and slippage.
4. Checks market state from synced Polymarket public market data.
5. Checks tick size and minimum order size using the public Polymarket CLOB orderbook when available, with conservative fallback values.
6. Estimates notional and maximum fee disclosure.
7. Returns Builder Code status, routed trading flag status, readiness gates, and disabled reasons.
8. Does not submit anything.
9. Does not mutate balances, ledger, positions, or matching state.
10. Does not require secrets.

## Geoblock

The browser checks:

```text
GET https://polymarket.com/api/geoblock
```

If the response is blocked, or the check cannot establish eligibility, order submission remains disabled with:

```text
你目前所在地區暫不支援 Polymarket 下單
```

The app must not bypass geographic restrictions.

## Order Construction

All orders are treated as limit orders. A market-style ticket is represented as a marketable limit order:

- BUY uses a worst acceptable price above the displayed price.
- SELL uses a worst acceptable price below the displayed price.
- FOK and FAK require a slippage guard.
- GTC and GTD remain standard limit order types.

The user must see the final confirmation copy:

```text
用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。
```

## Submit

The repo has a conservative backend route for user-signed Polymarket order routing, but live submit is blocked unless all readiness gates pass. The backend:

- Requires authentication.
- Requires a linked wallet.
- Requires a fresh non-blocked geoblock proof.
- Requires user-owned L2 credentials.
- Requires signature verification.
- Requires `builderCode` to match the signed order builder field.
- Refuses to use server-side signing for user orders.
- Rate limits routed submissions.
- Stores only safe routed-order audit metadata after an upstream submit.

The `/api/polymarket/orders/submit` app route is not enabled until the production-safe browser signing and credential path is complete.

## Builder Code

Every live order must include:

```text
POLY_BUILDER_CODE=0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca
```

If the code is missing, browsing and preview continue to work, but submit is disabled with:

```text
Builder Code 未設定
```

## Referral Attribution

Referral capture remains first-valid-code-wins:

- `/polymarket/[slug]?ref=CODE`
- capture before login
- persist pending attribution
- reject disabled codes
- reject self-referral when identity is known

On a successful routed order, the system records safe audit metadata only. Reward payout remains manual and admin-approved, and no payout calculation is made until confirmed Builder-fee revenue exists.
