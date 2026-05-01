# Builder Fee Reconciliation

Official Polymarket Builder-fee evidence is the source of truth for reward accounting. Local routed-order audits prove that Bet routed an order with the configured Builder Code, but audits alone must never create confirmed revenue, payable rewards, automatic payouts, or trading balance credits.

## Flow

1. Import official Builder-fee evidence into `polymarket_builder_fee_imports`.
2. Deduplicate by deterministic import key, external fee id, and source/trade/builder/fee tuple.
3. Match evidence to `polymarket_routed_order_audits`.
4. Confirm only when Builder Code, wallet, market/token, fee amount, and timing checks are safe.
5. Create one `builder_trade_attributions` row per confirmed evidence item.
6. Create reward ledger rows only from confirmed attributions.

If `POLYMARKET_BUILDER_FEE_EVIDENCE_URL` is missing, the sync is a safe no-op/pending-config run. It must not use mock data or fabricate confirmations.

## Statuses

- `imported`: evidence was stored but not safely matched.
- `matched`: a routed audit candidate was found.
- `confirmed`: evidence passed matching checks and can source reward ledger rows.
- `disputed`: evidence is malformed, duplicated, mismatched, or suspicious.
- `void`: evidence was invalidated by an operator process.

## Matching Rules

Strong keys are preferred: external order id, CLOB order id, external trade/fill id, Builder Code, trader wallet, market id, condition id, and token id.

Never confirm when the Builder Code mismatches, wallet mismatches, fee is zero or negative, routed audit is missing, duplicate evidence exists, or market/token mismatch is unresolved. Fee bps and notional tolerance are sanity checks, not a substitute for official evidence.

## Idempotency

`deterministic_import_key` is a SHA-256 key over stable official evidence fields. Confirmed attributions also store `source_builder_fee_import_id` and `source_evidence_key`, with unique indexes preventing duplicate confirmed attribution/reward creation.

## Operator Notes

Admin visibility is exposed through `/admin/polymarket` and `/admin/polymarket/status`. The page shows run history, counts, unmatched fee evidence, latest status, last error, Builder Code configured/missing, and payout exposure without exposing secrets.
