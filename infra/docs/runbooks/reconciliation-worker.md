# Runbook: Reconciliation worker

## Run
```bash
pnpm --filter @bet/reconciliation-worker dev
```

## Checks performed
- `ledger_balance_consistency`
- `reserve_vs_open_order_exposure`
- `position_trade_consistency`
- Base treasury checks:
  - `base_deposit_tx_not_finalized`
  - `base_withdrawal_missing_tx_hash`
  - `base_withdrawal_monitoring_state_mismatch`
  - `base_duplicate_tx_hash_usage`
  - `base_withdrawal_requested_state_mismatch`
  - `base_withdrawal_admin_processing_mismatch`
  - `base_withdrawal_requested_journal_kind_mismatch`
  - `base_withdrawal_completed_journal_kind_mismatch`
  - `base_withdrawal_failed_journal_kind_mismatch`
  - `base_withdrawal_requested_ledger_mismatch`
  - `base_withdrawal_completed_ledger_mismatch`
  - `base_withdrawal_failed_reversal_mismatch`
  - `base_withdrawal_failed_tx_hash_present`

## Key env var
- `BASE_RECON_MIN_CONFIRMATIONS` (default `12`)

## Expected schema/state for Base withdrawals
- Source table: `public.withdrawals`.
- Status values: `requested`, `completed`, `failed`.
- Journal links:
  - `requested_journal_id` must point to `ledger_journals.journal_kind = 'withdrawal_requested'`.
  - `completed_journal_id` (completed only) must point to `journal_kind = 'withdrawal_completed'`.
  - `failed_journal_id` (failed only) must point to `journal_kind = 'withdrawal_failed'`.
- Tx hash/admin fields:
  - completed rows require `tx_hash`, `processed_by`, and `processed_at`.
  - failed rows require `failure_reason`, `processed_by`, and `processed_at`; `tx_hash` must be null.
  - requested rows must not have `tx_hash`, `failure_reason`, `processed_by`, or `processed_at`.
- Ledger entries expected by status:
  - requested: debit `user:{user_id}:funds:withdrawal_pending`; credit `user:{user_id}:funds:available`.
  - completed: debit `platform:withdrawals:base_usdc`; credit `user:{user_id}:funds:withdrawal_pending`.
  - failed: debit `user:{user_id}:funds:available`; credit `user:{user_id}:funds:withdrawal_pending`.

## Inspect failures quickly
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, price, remaining_quantity, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, chain, status, tx_hash, requested_journal_id, completed_journal_id, failed_journal_id, processed_by, processed_at, failure_reason from public.withdrawals where chain='base' order by updated_at desc limit 100;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select lj.id, lj.journal_kind, le.account_code, le.direction, le.amount, le.currency from public.ledger_journals lj join public.ledger_entries le on le.journal_id = lj.id where lj.journal_kind in ('withdrawal_requested','withdrawal_completed','withdrawal_failed') order by lj.created_at desc, lj.id, le.id limit 300;"
```

## Containment
- If report fails: pause high-risk mutation (manual ledger ops, mass admin actions).
- Preserve evidence rows.
- Fix with compensating journals (`reconciliation_adjustment`) only.
