# Runbook: Withdrawal operations (manual/admin)

## Current flow
- User requests withdrawal via `POST /withdrawals`.
- Admin reviews queued requests via `GET /admin/withdrawals`.
- Admin finalizes each request manually:
  - execute: `POST /admin/withdrawals/:id/execute`
  - fail: `POST /admin/withdrawals/:id/fail`

## Authorization model (current behavior)
- Admin endpoints are gated by authenticated Supabase session + admin role.
- Do **not** rely on `x-admin-token` or `x-user-id` headers for authorization.

## Operator usage
For staging/web flows, perform admin actions from an authenticated admin session in the Admin UI.
If using API calls directly, ensure the request carries valid Supabase auth cookies for an admin user.

## Inspect records
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, status, amount, destination_address, tx_hash, failure_reason, processed_by, processed_at, created_at from public.withdrawals order by created_at desc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, journal_kind, reference, metadata, created_at from public.ledger_journals where journal_kind in ('withdrawal_requested','withdrawal_completed','withdrawal_failed') order by created_at desc limit 60;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_id, account_code, direction, amount, currency from public.ledger_entries where journal_id in (select id from public.ledger_journals where journal_kind in ('withdrawal_requested','withdrawal_completed','withdrawal_failed')) order by created_at desc limit 120;"
```

## Rollback / containment
- No in-place rollback state exists for `completed`/`failed`.
- If admin action was wrong: create compensating `reconciliation_adjustment` journal and record incident context in `public.audit_logs`.
