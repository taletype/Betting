# Runbook: Withdrawal operations (manual/admin)

## Current flow
- User requests withdrawal via `POST /withdrawals`.
- Admin reviews queued requests via `GET /admin/withdrawals`.
- Admin finalizes each request manually:
  - execute: `POST /admin/withdrawals/:id/execute`
  - fail: `POST /admin/withdrawals/:id/fail`

## Required headers
- Admin endpoints require `x-admin-token`.
- Execute/fail also require `x-user-id` (admin actor id for audit).

## Status transitions
- `requested` → `completed` (with `tx_hash`, `processed_at`, `processed_by`)
- `requested` → `failed` (with `failure_reason`, `processed_at`, `processed_by`)

## List pending withdrawals
```bash
curl -sS http://127.0.0.1:4000/admin/withdrawals \
  -H 'x-admin-token: dev-admin-token'
```

## Mark withdrawal executed
```bash
curl -sS -X POST http://127.0.0.1:4000/admin/withdrawals/<withdrawal_id>/execute \
  -H 'content-type: application/json' \
  -H 'x-admin-token: dev-admin-token' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"txHash":"0x<base_withdrawal_tx_hash>"}'
```

## Mark withdrawal failed
```bash
curl -sS -X POST http://127.0.0.1:4000/admin/withdrawals/<withdrawal_id>/fail \
  -H 'content-type: application/json' \
  -H 'x-admin-token: dev-admin-token' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"reason":"compliance hold"}'
```

## Inspect records
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, status, amount, destination_address, tx_hash, failure_reason, processed_by, processed_at, created_at from public.withdrawals order by created_at desc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, journal_kind, reference, metadata, created_at from public.ledger_journals where journal_kind in ('withdrawal_requested','withdrawal_completed','withdrawal_failed') order by created_at desc limit 60;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_id, account_code, direction, amount, currency from public.ledger_entries where journal_id in (select id from public.ledger_journals where journal_kind in ('withdrawal_requested','withdrawal_completed','withdrawal_failed')) order by created_at desc limit 120;"
```

## Rollback / containment
- No in-place rollback state exists for `completed`/`failed`.
- If admin action was wrong: create compensating `reconciliation_adjustment` journal and record incident context in `public.audit_logs`.
