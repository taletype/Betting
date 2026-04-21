# Runbook: Base Sepolia staging drill (go/no-go rehearsal)

Single operational drill for prelaunch. Keep it practical: run the stack, run smoke, collect artifacts, decide go/no-go.

## 0) Owners and artifact location

- Drill owner (DO): `<name>`
- Backend on-call (BE): `<name>`
- Reconciliation owner (RECON): `<name>`
- Release manager (RM): `<name>`

Save all evidence under one UTC-stamped folder:

- `infra/artifacts/launch-drill/<UTC timestamp>/`

---

## 1) Boot stack

```bash
./infra/scripts/check-env.sh
supabase start
pnpm db:reset
pnpm dev:api
pnpm dev:workers
pnpm dev:web
```

Pass:
- env check passes
- services stay up (no crash loop)

---

## 2) Verify health/readiness

```bash
curl -fsS ${API_URL:-http://127.0.0.1:4000}/health
curl -fsS ${API_URL:-http://127.0.0.1:4000}/ready
curl -fsS ${WS_HEALTH_URL:-http://127.0.0.1:4001/health}
```

Pass: all return HTTP 200.

---

## 3) Verify Base Sepolia config + prerequisites

### Required config (staging/prelaunch)
- `BASE_CHAIN_ID=84532`
- `BASE_TREASURY_ADDRESS` set
- `BASE_USDC_ADDRESS` set
- DB URL set (`SUPABASE_DB_URL` or `DATABASE_URL`)

### Funding prerequisites
- At least two funded test wallets on Base Sepolia:
  - user wallet (wallet link + deposit/user actions)
  - admin/operator wallet (admin actions)
- Test USDC available for deposit/withdraw flow testing.

Record faucet/funding tx hashes in artifacts.

---

## 4) Run the Base Sepolia lifecycle smoke (single command)

```bash
pnpm smoke:launch-proof
```

This is the required drill command. It runs the DB happy-path lifecycle and emits evidence for:
- wallet link
- deposit verification
- resting order
- crossing order
- match/trade assertions
- market resolution
- claim
- withdrawal request
- admin execute + admin fail paths

Expected artifacts from this command:
- `infra/artifacts/smoke-db/latest.log`
- `infra/artifacts/smoke-db/latest.json`
- `infra/artifacts/smoke-db/latest-reconciliation.log`
- `infra/artifacts/smoke-db/latest-launch-proof.json`


### Optional visual artifact command

```bash
pnpm screenshots:pack
```

Output path:
- `infra/artifacts/screenshot-pack/latest/`

The JSON output includes chain/network info, linked wallet, deposit verification result, maker/taker order results, trades, positions, balances, resolution result, claim result, withdrawals, and tx/explorer links when present.

---

## 5) Reconciliation run

```bash
pnpm --filter @bet/reconciliation-worker dev
```

Capture one successful cycle in the drill artifact folder.

Pass: no critical reconciliation failures.

---

## 6) Final verification checks

Run and save outputs:

```bash
psql "$DRILL_DB_URL" -c "select id, tx_hash, tx_status, amount, verified_at from public.chain_deposits order by verified_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select id, status, amount, tx_hash, failure_reason, processed_by, processed_at, created_at from public.withdrawals order by created_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select id, market_id, price, quantity, matched_at from public.trades order by matched_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select user_id, market_id, outcome_id, quantity, average_entry_price, updated_at from public.positions order by updated_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select id, user_id, market_id, status, claimable_amount, claimed_amount, updated_at from public.claims order by updated_at desc limit 20;"
```

Pass:
- latest smoke lifecycle rows are present and internally consistent
- no obvious stuck/invalid withdrawal state

---

## Artifact checklist (required)

Save to `infra/artifacts/launch-drill/<UTC timestamp>/`:

- [ ] `health.json` and `ready.json`
- [ ] `ws-health.json`
- [ ] `smoke-db-latest.log` (copy of `infra/artifacts/smoke-db/latest.log`)
- [ ] `smoke-db-latest.json` (copy of `infra/artifacts/smoke-db/latest.json`)
- [ ] `reconciliation.log`
- [ ] `deposits.txt`, `withdrawals.txt`, `trades.txt`, `positions.txt`, `claims.txt`
- [ ] `tx-hashes.md` (deposit/withdraw/faucet/admin tx hashes + explorer links)
- [ ] screenshots (if used during manual UI validation):
  - portfolio balances/history
  - market trade reflected
  - admin withdrawal action result

---

## Go / No-Go checklist (hard gates)

Mark each item PASS/FAIL:

- [ ] Typecheck/tests green (`pnpm typecheck`, `pnpm test` or equivalent release validation run)
- [ ] Base Sepolia launch-proof passed (`pnpm smoke:launch-proof`) with `latest.log`, `latest.json`, `latest-reconciliation.log`, and `latest-launch-proof.json`
- [ ] Auth/admin gating fix verified (no header-based impersonation path; admin endpoints session-role gated)
- [ ] Reconciliation clean (no critical failures)
- [ ] Runbooks current (this file + related ops runbooks match shipped behavior)
- [ ] No critical open launch blockers in release tracker

**No-Go if any gate fails.**
