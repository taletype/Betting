# Production Launch Checklist

This checklist is for the public zh-HK Polymarket referral portal only. It does not enable live routed Polymarket trading, custody, order submission, or automatic reward payouts.

## Required for Public Browsing

- `NEXT_PUBLIC_SITE_URL` points at the production site.
- Supabase public auth config is present for login surfaces.
- External market sync has run recently, or public routes can serve safe empty states/fallback data.
- `/api/health`, `/api/version`, `/api/external/markets`, and `/polymarket` return non-secret responses.

## Must Remain Disabled

- `POLYMARKET_ROUTED_TRADING_ENABLED=false`
- `POLYMARKET_CLOB_SUBMITTER=disabled`
- `AMBASSADOR_AUTO_PAYOUT_ENABLED=false`
- No production user-signature verifier, L2 credential submitter, or geoblock proof verifier should be treated as ready until separately reviewed.

## Supabase Setup

- Apply migrations, including wallet link challenges and ambassador risk flags.
- Confirm RLS is enabled on challenge/risk tables.
- Confirm admin users carry the Supabase admin role in app metadata.

## Referral And Rewards

- Referral capture persists before login and applies after auth.
- Rewards remain direct-referral only: platform 60%, direct referrer 30%, trader cashback 10%.
- Payouts remain manual/admin-approved, with no automatic treasury transfer.
- Open high-severity risk flags block payout approval until reviewed.

## Vercel And Rollback

- Deploy with no live Polymarket credentials required for public browsing.
- Verify admin pages require authenticated admin sessions.
- Roll back to the previous Vercel deployment if public market pages, auth, or referral capture fail.

## Smoke Test

```sh
BASE_URL=https://your-deployment.example pnpm smoke:polymarket-public
```
