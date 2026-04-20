# Operations Runbooks

## 0) Architecture map (who owns what)

- **`apps/web`**: operator/admin UI, market UI, cron endpoints (`/api/cron/*`) for health/external-sync/candles.  
- **`services/api`**: HTTP API for markets/orders/portfolio/wallet link/deposit verify (`/health`, `/ready`, `/orders`, `/deposits/verify`, etc.).  
- **`services/matching-worker`**: drains `public.matching_commands`, matches orders, persists trades/orders/positions updates.  
- **`apps/ws`**: listens on Postgres `public_market_events`, serves websocket snapshots + deltas.  
- **`services/reconciliation-worker`**: runs DB consistency checks (ledger balancing, reserve exposure, position-vs-trade).  
- **`services/external-sync-worker`**: upserts external markets/outcomes/trade ticks/checkpoints.  
- **`supabase`**: local Postgres/auth + migrations + seed.

---

## 1) Local development startup

### Checklist

1. Install deps:

```bash
pnpm install
```

2. Start Supabase:

```bash
supabase start
```

3. Reset DB (migrations + seed):

```bash
supabase db reset
```

4. Start API:

```bash
pnpm --filter @bet/service-api dev
```

5. Start matching worker:

```bash
pnpm --filter @bet/matching-worker dev
```

6. Start websocket server:

```bash
pnpm --filter @bet/ws dev
```

7. Start web app:

```bash
pnpm --filter @bet/web dev
```

8. Optional workers:

```bash
pnpm --filter @bet/reconciliation-worker dev
pnpm --filter @bet/external-sync-worker dev
pnpm --filter @bet/settlement-worker dev
```

### Quick readiness probes

```bash
curl -sS http://localhost:4000/health
curl -sS http://localhost:4000/ready
curl -sS http://localhost:4001/health
```

Expected:
- API health returns `{"ok":true,"service":"api",...}`
- API ready returns `{"ok":true,"service":"api","ready":true,...}`
- WS health returns `{"ok":true}`

---

## 2) DB reset and seeding

### Standard reset

```bash
supabase db reset
```

This reapplies migrations and `supabase/seed.sql`.

### Verify seed records

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, username from public.profiles order by created_at;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, slug, status from public.markets order by id;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_kind, reference from public.ledger_journals where reference like 'seed:%' order by reference;"
```

---

## 3) Happy-path verification (orders + matching + trades)

### Fast path (scripted)

```bash
pnpm --filter @bet/service-api test:db-happy-path
```

Expected:
- Prints `db-happy-path: ok`
- Outputs JSON with `processedJobs`, `tradeId`, order IDs, and balance/position deltas.

### Manual spot-check SQL

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, remaining_quantity, reserved_amount, matching_processed_at from public.orders order by created_at desc limit 10;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, market_id, sequence, price, quantity, matched_at from public.trades order by matched_at desc limit 10;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, market_id, outcome_id, net_quantity, average_entry_price from public.positions order by updated_at desc limit 10;"
```

---

## 4) Deposit verification operations

## Prereqs

- User has linked wallet (`POST /wallets/link`)
- Env vars for API process:
  - `BASE_TREASURY_ADDRESS` (**required**)
  - `BASE_USDC_ADDRESS` (default provided)
  - `BASE_MIN_CONFIRMATIONS` (default `3`)
  - `BASE_RPC_URL` (default `https://mainnet.base.org`)

### Run verification call

```bash
curl -sS -X POST http://localhost:4000/deposits/verify \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"txHash":"0x<base_tx_hash>"}'
```

Expected status values:
- `accepted` (new credit)
- `already_credited` (idempotent replay)

### Tables to inspect

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, tx_hash, amount, tx_status, journal_id, verified_at from public.chain_deposits order by verified_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, tx_hash, status, reason, metadata, created_at from public.deposit_verification_attempts order by created_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, journal_kind, reference, metadata, created_at from public.ledger_journals where journal_kind='deposit_confirmed' order by created_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_id, account_code, direction, amount, currency, created_at from public.ledger_entries where journal_id in (select id from public.ledger_journals where journal_kind='deposit_confirmed') order by created_at desc limit 40;"
```

### Containment / rollback guidance

- If verification is failing globally, **stop calling `/deposits/verify`** and fix env/RPC first.
- If tx is rejected (`wrong_sender`, `wrong_recipient`, `wrong_token`, etc.), do **not** journal manual credit unless incident lead approves.
- If an incorrect credit occurred, containment is:
  1. record incident context in `audit_logs` via admin SQL,
  2. create compensating ledger journal (`reconciliation_adjustment`) instead of mutating existing entries,
  3. keep `chain_deposits` and attempts as immutable evidence.

---

## 5) Withdrawal operations (manual/admin)

Current codebase status:
- No withdrawal HTTP endpoint.
- No implemented withdrawal worker/executor.
- `withdrawal` exists as an allowed `ledger_journals.journal_kind` only.

### Current operator playbook

1. **Do not promise automated withdrawals** in this environment.
2. Track requests out-of-band (ticket + wallet + amount + reviewer).
3. If manual accounting is needed, post a reviewed ledger journal via SQL migration/script (double-entry + audit trail).
4. Re-run reconciliation worker after any manual adjustment.

Recommended post-check:

```bash
pnpm --filter @bet/reconciliation-worker dev
```

---

## 6) Reconciliation worker usage

### Run

```bash
pnpm --filter @bet/reconciliation-worker dev
```

### What it checks

- `ledger_balance_consistency`: each journal debits == credits
- `reserve_vs_open_order_exposure`: `orders.reserved_amount == price * remaining_quantity` for open/partial
- `position_trade_consistency`: positions net quantity equals trade-derived net

### Inspect failures manually

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, price, remaining_quantity, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
```

---

## 7) External-sync-worker usage

### Run

```bash
pnpm --filter @bet/external-sync-worker dev
```

### Verify sync output

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, external_id, title, status, last_synced_at from public.external_markets order by last_synced_at desc nulls last limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select external_market_id, external_trade_id, side, price, traded_at from public.external_trade_ticks order by traded_at desc limit 20;"
```

### Containment

- If upstream APIs fail/noise, stop external-sync-worker first.
- Keep API + matching up; external sync is read-only and should not affect balances.
- Resume worker once adapter/API issues are resolved.
