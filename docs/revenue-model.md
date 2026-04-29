# Revenue Model

## Polymarket Builder-Fee Revenue

This is the primary v1 reward revenue source.

- Eligible only after a confirmed matched routed Polymarket order with Builder-fee attribution.
- Eligible for the platform/referrer/trader cashback split.
- Can create ambassador reward accounting records.
- Payout remains manual/admin-approved.

## Thirdweb Developer / Swap / Payment Fee Revenue

This is platform-only v1 accounting.

- Track separately only when confirmed by Thirdweb provider dashboard, export, or webhook.
- Not included in ambassador rewards in v1.
- Does not create referral reward records.

## Thirdweb Fiat Provider Fees

These are external provider fees.

- Do not count as platform revenue unless explicitly confirmed by provider/dashboard export.
- Not included in ambassador rewards in v1.

## Safety

- No internal user balance is created from Thirdweb funding.
- No internal trading ledger mutation is created from Thirdweb funding or external Polymarket activity.
- No automatic payout is enabled.
- No multi-level, ancestry, or recursive reward structure is included.
