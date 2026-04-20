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
  - `base_withdrawal_tx_not_confirmed`
  - `base_duplicate_tx_hash_usage`

## Key env var
- `BASE_RECON_MIN_CONFIRMATIONS` (default `12`)

## Inspect failures quickly
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, price, remaining_quantity, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, tx_hash, tx_status, amount, currency from public.chain_deposits where chain='base' and tx_status='confirmed' order by verified_at desc limit 50;"
```

## Important current-code caveat
- Base withdrawal reconciliation query reads `public.withdrawal_requests`.
- Withdrawals are stored in `public.withdrawals` in current migrations.
- Result: withdrawal-side treasury checks may be skipped until code is aligned.

## Containment
- If report fails: pause high-risk mutation (manual ledger ops, mass admin actions).
- Preserve evidence rows.
- Fix with compensating journals (`reconciliation_adjustment`) only.
