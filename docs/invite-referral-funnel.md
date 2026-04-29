# Invite Referral Funnel

Supported capture URLs:

- `/?ref=CODE`
- `/polymarket?ref=CODE`
- `/polymarket/[slug]?ref=CODE`

Behavior:

- Capture the referral code before login.
- Persist it in browser storage and cookie so it survives navigation.
- Show pending referral state before login.
- Apply the first valid referral after signup or login.
- First valid attribution wins.
- Reject self-referral when identity is known.
- Disabled codes cannot be used.

Reward attribution:

- Rewards are direct-referral only.
- Confirmed Builder-fee revenue is split platform 60%, direct referrer 30%, trader cashback 10%.
- If no direct referrer exists, the referrer share goes to platform.
- Reward accounting is separate from trading balances.

Safety:

- No custody, no pooled user funds, no platform-placed trades.
- No automatic treasury transfer.
- Payout remains manual and admin-approved through Polygon pUSD.
