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

1. The system may create a payout request automatically after payable rewards meet the configured threshold and the user has a valid Polygon payout wallet.
2. Admin reviews the payout request.
3. Admin approves the payout.
4. Admin pays pUSD manually on Polygon.
5. Admin records the 32-byte Polygon transaction hash and marks the payout paid, failed, or cancelled.

`AMBASSADOR_AUTO_PAYOUT_REQUEST_ENABLED` defaults to false. `AMBASSADOR_AUTO_PAYOUT_ENABLED` defaults to false and must remain false. No production money transfer adapter, private-key flow, signer, or broadcast path was added.

## Operational Notes

CSV export is provided for manual payout review. Wallet paid status changes require a Polygon transaction hash.

Legal review is required before launch in Hong Kong.
