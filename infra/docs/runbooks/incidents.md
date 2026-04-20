# Incident response runbook

Use this order: **contain → capture evidence → remediate → verify**.

## 1) Stuck matching queue
### Detect
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, order_id, created_at, claimed_at, claim_expires_at, processed_at, attempt_count, last_error from public.matching_commands order by created_at asc limit 100;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, matching_processed_at, created_at from public.orders order by created_at desc limit 50;"
```
### Contain
- Pause new order intake.
- Restart matching worker:
  ```bash
  pnpm --filter @bet/matching-worker dev
  ```
### Verify
- `processed_at` starts filling for oldest commands.
- `orders.status` progresses out of `pending`.

## 2) Failed reconciliation
### Detect
```bash
pnpm --filter @bet/reconciliation-worker dev
```
### Triage SQL
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
```
### Contain
- Pause manual/admin ledger mutations.
- Preserve failing rows and logs.
- Use compensating `reconciliation_adjustment` journals only.

## 3) Failed deposit verification
### Detect
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, tx_hash, status, reason, metadata, created_at from public.deposit_verification_attempts order by created_at desc limit 100;"
```
### Contain
- Stop `/deposits/verify` requests.
- Confirm API env (`BASE_TREASURY_ADDRESS`, `BASE_RPC_URL`, `BASE_USDC_ADDRESS`, `BASE_MIN_CONFIRMATIONS`).
- Communicate delayed crediting.
### Verify
```bash
curl -sS -X POST http://127.0.0.1:4000/deposits/verify -H 'content-type: application/json' -H 'x-user-id: 00000000-0000-4000-8000-000000000001' -d '{"txHash":"0x<hash>"}'
```

## 4) Failed withdrawal execution (manual/admin)
### Detect
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, tx_hash, failure_reason, processed_by, processed_at, updated_at from public.withdrawals order by updated_at desc limit 100;"
```
Typical signal: many withdrawals stuck in `requested` or unexpected rise in `failed`.

### Contain
- Freeze execute/fail admin actions until cause is known.
- Validate admin token/user-id headers and chain tx handling process.
- Keep user funds state intact (no direct row edits).

### Remediate
- Retry with explicit admin action:
  - execute path: `/admin/withdrawals/:id/execute`
  - fail path: `/admin/withdrawals/:id/fail`
- If an incorrect completion/failure was posted, add compensating ledger journal + audit log.

## 5) Websocket sequence gap
### Detect
```bash
curl -fsS http://127.0.0.1:4001/health
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, updated_at from public.market_realtime_sequences order by updated_at desc limit 30;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, matched_at from public.trades order by matched_at desc, sequence desc limit 100;"
```
### Contain
- Restart WS service.
- Force client resubscribe to rebuild snapshot + delta stream.
- If needed, restart matching worker and temporarily route clients to polling.
