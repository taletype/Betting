# Wallet/User Binding Attribution

Reward eligibility requires a clear chain from app user to verified wallet to Polymarket routed trade evidence.

Required identities:
- App user id.
- Verified linked wallet address.
- Payout wallet address for manual rewards payout.
- Polymarket order signer or supported proxy/trading wallet when available.
- Applied referral attribution.
- Builder trade attribution created from routed order and confirmed Builder-fee evidence.

Rules:
- EVM addresses are normalized to lowercase `0x` form.
- Linked wallets require a user-owned signature challenge before `verified_at` is set.
- `user_wallets` exposes verified linked wallets for attribution review.
- A Builder-fee trade is reward-eligible only when it can be tied to an app user and verified wallet.
- The route event trader/signer wallet must match the verified wallet, or an explicitly supported proxy/trading wallet binding.
- Referral attribution must exist before the eligible routed trade confirmation; earlier route submission time is preferred when present.
- Same-user and same-wallet self-referrals are rejected.
- Shared payout wallets between referrer and referred user are flagged for review.
- Disabled referral codes cannot create reward eligibility.
- Admin overrides must be audited and must not silently rewrite past paid rewards.

Wallet audit events:
- `wallet_bound`
- `wallet_verified`
- `wallet_unbound`

Never store or log private keys, full auth headers, L2 secrets, passphrases, or user signatures outside existing safe audit requirements.
