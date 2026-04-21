I have resolved the merge conflicts and cleaned up the formatting to ensure the checklist is production-ready. I grouped the environment variables logically to make the pre-flight validation easier for the team.

---

# Launch Checklist (Short)

> **Note:** RC freeze and merge sequencing live in `infra/docs/release-candidate-freeze-plan.md`.
> Use this file for **launch-day execution only**.
> For pre-launch dress rehearsals, refer to `infra/docs/runbooks/staging-launch-drill.md`.

## 1) Required Services

Ensure the following services are operational:
* **Supabase:** Local or hosted DB + Auth.
* **`@bet/service-api`:** Running on port `4000`.
* **`@bet/ws`:** Running on port `4001`.
* **`@bet/matching-worker`**
* **`@bet/web`**
* **Optional (Recommended):**
    * `@bet/reconciliation-worker`
    * `@bet/external-sync-worker`

---

## 2) Required Environment Variables

Refer to the full matrix in `infra/docs/runbooks/environment-configuration.md`.
Run `./infra/scripts/check-env.sh` to validate this minimum set:

### Database & Supabase
* `DATABASE_URL` / `SUPABASE_DB_URL`
* `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
* `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `SUPABASE_JWT_SECRET`

### API & Networking
* `API_BASE_URL`
* `NEXT_PUBLIC_WS_URL`
* `ADMIN_API_TOKEN`

### Blockchain (Base Network)
* `BASE_CHAIN_ID`
* `BASE_RPC_URL`
* `BASE_WS_URL`
* `BASE_EXPLORER_URL`
* `BASE_TREASURY_ADDRESS`
* `BASE_USDC_ADDRESS`
* `BASE_MIN_CONFIRMATIONS`
* `BASE_RECON_MIN_CONFIRMATIONS`

---

## 3) Health Checks

Execute these commands to verify connectivity:

```bash
# Validate Env
./infra/scripts/check-env.sh

# API Health & Readiness
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/ready

# WebSocket Health
curl -fsS http://127.0.0.1:4001/health
```

---

## 4) Pre-Launch Smoke Steps

```bash
supabase start
pnpm db:reset
pnpm dev:api
pnpm dev:workers
pnpm dev:web
pnpm smoke:local
```

### Manual Spot Checks
- [ ] **Orders:** Place/cancel an order; confirm `matching_commands.processed_at` updates.
- [ ] **Deposits:** Verify one known deposit transaction in a non-prod/test setup.
- [ ] **Markets:** Resolve one test market via the Admin UI/API.
- [ ] **Safety:** Execute and confirm a **failed** path for one test withdrawal.

---

## 5) Post-Launch Monitoring

**Reference:** `infra/docs/runbooks/launch-monitoring.md` for specific metric names, dashboards, and alert thresholds.

* **Matching Queue:** Monitor `public.matching_commands` for `processed_at`, `attempt_count`, and `last_error`.
* **Deposits:** Check `public.deposit_verification_attempts` for success/rejection ratios.
* **Withdrawals:** Monitor `public.withdrawals` where `status = 'requested'`.
* **Ledger Consistency:** Run the reconciliation worker on a set interval.
* **Real-time Feed:** Verify `public.market_realtime_sequences` for consistent movement.
* **External Sync:** Check `last_synced_at` in `public.external_markets` and `synced_at` in `external_sync_checkpoints`.