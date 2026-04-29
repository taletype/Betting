# Invite Referral Funnel

Supported capture URLs:

- `/?ref=CODE`
- `/polymarket?ref=CODE`
- `/polymarket/[slug]?ref=CODE`
- `/ambassador?ref=CODE`
- `/guides/... ?ref=CODE`

Behavior:

- Capture the referral code before login.
- Persist it in browser storage and cookie so it survives navigation.
- Referral-aware navigation preserves the pending code across first-party links before login.
- Show pending referral state before login.
- Apply the first valid referral after signup or login.
- Apply attribution server-side only after Supabase Auth validates the user session.
- First valid attribution wins.
- Reject self-referral when identity is known.
- Disabled codes cannot be used.

Reward attribution:

- Rewards are direct-referral only.
- Confirmed Builder-fee revenue is split platform 60%, direct referrer 30%, trader cashback 10%.
- Thirdweb developer/swap/payment fee revenue is platform-only v1 and excluded from ambassador rewards.
- Fiat onramp provider fees are external provider fees unless explicitly confirmed by provider export.
- If no direct referrer exists, the referrer share goes to platform.
- Reward accounting is separate from trading balances.
- Rewards and payout requests are accounting records, not a user trading balance.

Safety:

- No custody, no pooled user funds, no platform-placed trades.
- Thirdweb funding sends funds to the user-controlled wallet and does not create internal balances.
- No automatic treasury transfer.
- Payout remains manual and admin-approved through Polygon pUSD.
- No automatic payout, treasury transfer, recursive reward, or indirect referral logic is part of this funnel.
