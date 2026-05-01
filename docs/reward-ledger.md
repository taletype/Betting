# Reward Ledger

Rewards are calculated only from confirmed Polymarket Builder-fee evidence. Local routed-order audits, public trade ticks, admin placeholders, pending evidence, disputed evidence, or unconfirmed trade attribution must not create payable rewards.

Split:
- Platform: 60%
- Direct referrer: 30%
- Trader cashback: 10%

If there is no valid direct referrer, the 30% referrer share stays with platform revenue. Rewards are direct-referral only: there is no second-level, recursive, or tree calculation.

Confirmed Builder attribution creates ledger rows once using the trade attribution and source evidence as idempotency boundaries. Duplicate evidence or duplicate attribution must not double-create rewards. Voided attribution voids unpaid rewards. Paid rewards are immutable in normal flows and require explicit admin adjustment plus audit trail if correction is ever needed.

Reward rows are accounting records only. They are not betting/trading balances and must not mutate internal trading balances. They also must not trigger automatic payout execution.

Canonical reward rows are exposed through `reward_ledger_entries` with beneficiary type, source trade attribution, optional revenue ledger id, chain id `137`, asset `pUSD`, calculation bps, status, payout reservation id, and idempotency key.

Rewards must not be created from referral clicks, signups, wallet connects, trade attempts, submitted orders, or unconfirmed matches. Only confirmed Builder-fee revenue can produce reward accounting.
