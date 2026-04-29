# Current Product Direction

This app is a zh-HK first Polymarket market portal with referral/invite acquisition, safe Builder Code attribution, direct-referral reward accounting, and manual/admin-approved payouts.

## Canonical Funnel

1. Friend shares invite link.
2. User lands on the site.
3. User browses public Polymarket markets.
4. User signs up or connects a wallet.
5. When all safety gates are proven, user trades through a non-custodial Polymarket-routed flow.
6. User signs their own order.
7. App includes `POLY_BUILDER_CODE` before the user signs so the signed V2 order contains Builder attribution.
8. Confirmed Builder-fee revenue can create direct-referral rewards.
9. Payout remains manual and admin-approved.

## Live Surfaces

- `/` redirects into the market experience.
- `/polymarket` is the canonical public Polymarket market portal.
- `/external-markets` remains a compatibility alias for `/polymarket`.
- `/polymarket/[slug]` is reserved for external market deep links and redirects into the portal.
- `/ambassador`, `/rewards`, `/account`, and valid `/admin/*` pages remain part of the referral/reward/admin workflow.
- Public market browsing must work without `POLY_BUILDER_CODE`.

## Polymarket Market Visibility Deployment

Public market browsing depends on the deployed web app being able to call the backend `GET /external/markets` endpoint. On Vercel, configure:

- `API_BASE_URL` - required server-side API origin for `/polymarket`.
- `NEXT_PUBLIC_API_BASE_URL` - required only if client/browser calls need the API directly.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` / `SUPABASE_DB_URL` where required by API or sync workers.
- `POLYMARKET_GAMMA_URL`
- `POLYMARKET_CLOB_URL`
- `POLY_BUILDER_CODE` - required only for routed trading.
- `POLYMARKET_ROUTED_TRADING_ENABLED=false`
- `POLYMARKET_CLOB_SUBMITTER=disabled`

Run the read-only external market sync before expecting visible rows:

```sh
pnpm sync:external
```

Verify the backend before checking the UI:

```sh
curl "$API_BASE_URL/external/markets"
```

An empty `[]` response means the route is reachable but `external_markets` has no synced rows yet.

## Disabled By Default

- Polymarket routed trading defaults off with `POLYMARKET_ROUTED_TRADING_ENABLED=false` and `POLYMARKET_CLOB_SUBMITTER=disabled`.
- Automatic ambassador payouts are disabled with `AMBASSADOR_AUTO_PAYOUT_ENABLED=false`.
- A real CLOB V2 adapter exists, but live submission remains blocked until secure user L2 credential storage/derivation and server-side V2 signature verification are proven in staging.
- No automatic production payout transfer is enabled by this cleanup pass.

## Production Chain

- Production internal chain support is Base only.
- Production uses `BASE_CHAIN_ID=8453`, `BASE_RPC_URL`, `BASE_USDC_ADDRESS`, and `BASE_TREASURY_ADDRESS`.
- Base Sepolia (`84532`) is retained only for staging/smoke/dev evidence paths.
- Generic Ethereum Sepolia (`11155111`, `SEPOLIA_RPC_URL`, `ETHEREUM_SEPOLIA`) is not part of the product or production config.

## Boundaries

- The app uses public Polymarket APIs for browsing/sync; scraping is not a product dependency.
- Polymarket routed trading must remain non-custodial and user-signed.
- The platform must not custody Polymarket funds or place trades for users.
- Polymarket routed trading must not mutate internal balances, internal ledger journals, deposits, withdrawals, matching state, claims, or portfolio accounting.
- Referral rewards are direct-referral only.
- No multi-level, recursive, package-unlock, or return-guarantee reward model is part of the product.
- Reward payout review remains manual/admin-approved.
