# Reward payout reservations

This document defines the release-candidate reservation model for ambassador reward payouts.

## Scope

Rewards remain accounting records only. They are not trading balance, betting balance, or spendable platform credit. Payouts remain manual and admin-approved. No automatic treasury transfer is enabled by this model.

## Reservation state

Payable user rewards are reserved when a payout request is open. The current application model uses `ambassador_reward_ledger.status = 'approved'` as the reserved reward state.

Migration `0034_reward_payout_reservations.sql` makes that status explicit by adding:

- `reserved_by_payout_id`
- `reserved_at`
- reservation indexes for admin review
- a canonical `reward_ledger_entries` view that exposes reservation metadata

## Status flow

Reward ledger rows follow this flow:

```txt
pending -> payable -> approved/reserved -> paid
pending -> void
payable -> approved/reserved -> payable, when payout failed/cancelled
```

`approved` is not a treasury payment. It only means the reward row is reserved for an open payout request.

Payout requests follow this flow:

```txt
requested -> approved -> paid
requested -> cancelled
approved -> failed
approved -> cancelled
```

When an approved/requested payout becomes `failed` or `cancelled`, linked reserved rewards are released back to `payable`.

When an approved payout becomes `paid`, linked reserved rewards become `paid`. A wallet payout still requires admin action and a valid Polygon transaction hash.

## Operator checks

Before deploy, verify:

- Supabase has applied migration `0034_reward_payout_reservations.sql`.
- `AMBASSADOR_AUTO_PAYOUT_ENABLED` is absent or `false`.
- payout rail remains Polygon pUSD if enabled.
- admin auth is real Supabase/admin-role auth, not spoofable headers.
- no service-role key appears in frontend-rendered HTML or `NEXT_PUBLIC_*` environment values.
- failed/cancelled payouts release reserved reward rows back to `payable`.
- paid payout rows have a valid Polygon transaction hash.
