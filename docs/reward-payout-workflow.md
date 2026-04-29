# Reward Payout Workflow

## Status Lifecycle

Reward ledger statuses:

- `pending`
- `payable`
- `approved`
- `paid`
- `void`

Payout request statuses:

- `requested`
- `approved`
- `paid`
- `failed`
- `cancelled`

## Automatic Calculation

When an eligible Builder-fee trade attribution is recorded and Ambassador Rewards are enabled, the system can automatically create reward ledger entries:

- Platform revenue: 60%
- Direct referrer commission: 30%, only for the direct referrer
- Trader cashback: 10%

If no direct referrer exists, the direct-referrer share remains platform revenue.

Calculation creates accounting entries only. It does not transfer money and does not touch the internal trading ledger or balances.

## Manual Payout Review

V1 payout behavior:

1. User requests payout after payable rewards meet the configured threshold.
2. Admin reviews the payout request.
3. Admin approves the payout.
4. Admin pays manually outside the app or through a future controlled adapter.
5. Admin marks the payout paid, failed, or cancelled.

`AMBASSADOR_AUTO_PAYOUT_ENABLED` defaults to false and cannot be true unless rewards are enabled. No production money transfer adapter was added in this scaffold.

## Operational Notes

CSV export is provided for manual payout review. All paid status changes should include an external reference or transaction hash when available.

Legal review is required before launch in Hong Kong.
