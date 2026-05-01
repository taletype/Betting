# Builder-Fee Revenue Ledger

`POLY_BUILDER_CODE` is the only Builder Code that can create eligible Builder-fee revenue:

`0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca`

Trade-route events are accounting evidence only. They do not create payable rewards. Confirmed Builder-fee evidence is imported, matched to routed-order audits, and then written to `builder_fee_revenue_ledger`.

Route event types:
- `routed_trade_attempted`
- `builder_attribution_prepared`
- `builder_attribution_submitted`
- `routed_order_signed`
- `routed_order_submitted`
- `routed_order_matched`
- `builder_fee_confirmed`
- `builder_fee_voided`

Revenue rules:
- Missing or mismatched Builder Code is ineligible.
- Builder Code must exactly match configured `POLY_BUILDER_CODE`.
- Duplicate confirmations use idempotency keys and do not duplicate revenue.
- Pending revenue is not payable.
- Confirmed revenue may create reward ledger rows once.
- Voided revenue voids unpaid linked rewards.
- Paid rewards are never silently mutated; corrections require admin adjustment and audit.
- Revenue with no valid direct referrer keeps the referrer share in platform revenue.

The ledger records source, external order/trade ids, app user, trader wallet, referral attribution, Builder Code, market, side, notional, fee bps, fee amount, asset, status, confirmation source, idempotency key, and raw evidence metadata.
