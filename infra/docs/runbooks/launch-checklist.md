# Launch checklist (short)

> RC freeze and merge sequencing live in `infra/docs/release-candidate-freeze-plan.md`.
> Use this file for launch-day execution only.

## 1) Required services
- Supabase local/hosted DB + auth.
- `@bet/service-api` (port 4000 by default).
- `@bet/ws` (port 4001 by default).
- `@bet/matching-worker`.
- `@bet/web`.
- Optional but recommended at launch:
  - `@bet/reconciliation-worker`
  - `@bet/external-sync-worker`

## 2) Required env vars
Use the full matrix in `infra/docs/runbooks/environment-configuration.md`.

Launch-minimum set (validated by `./infra/scripts/check-env.sh`):
- `DATABASE_URL`
- `SUPABASE_DB_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `API_BASE_URL`
- `NEXT_PUBLIC_WS_URL`
- `ADMIN_API_TOKEN`
- `BASE_RPC_URL`
- `BASE_CHAIN_ID`
- `BASE_TREASURY_ADDRESS`
- `BASE_USDC_ADDRESS`
- `BASE_MIN_CONFIRMATIONS`
- `BASE_RECON_MIN_CONFIRMATIONS`

## 3) Health checks
```bash
./infra/scripts/check-env.sh
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/ready
curl -fsS http://127.0.0.1:4001/health
```

## 4) Pre-launch smoke steps
```bash
supabase start
pnpm db:reset
pnpm dev:api
pnpm dev:workers
pnpm dev:web
pnpm smoke:local
```
Manual spot checks:
- Place/cancel order and confirm `matching_commands.processed_at` updates.
- Verify one known deposit tx in non-prod/test setup.
- Resolve one test market in admin UI/API.
- Execute and fail one test withdrawal path.

## 5) Post-launch monitoring checks
Reference: `infra/docs/runbooks/launch-monitoring.md` for metric names, dashboard panels, and alert thresholds.

- Matching queue depth and retries:
  - `public.matching_commands.processed_at`, `attempt_count`, `last_error`
- Deposit verification success/rejection mix:
  - `public.deposit_verification_attempts`
- Withdrawal backlog:
  - `public.withdrawals where status='requested'`
- Ledger consistency:
  - run reconciliation worker on interval.
- WS sequence movement:
  - `public.market_realtime_sequences`
- External sync freshness:
  - `public.external_markets.last_synced_at`, `external_sync_checkpoints.synced_at`
