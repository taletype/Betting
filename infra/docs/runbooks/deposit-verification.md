# Runbook: Deposit verification operations

## Required env vars (API process)
- `BASE_TREASURY_ADDRESS` (**required**)
- `BASE_USDC_ADDRESS` (defaults to Base USDC)
- `BASE_MIN_CONFIRMATIONS` (default `3`)
- `BASE_RPC_URL` (default `https://mainnet.base.org`)

## Preconditions
- User must have linked Base wallet (`POST /wallets/link`).
- API must be healthy.

## Verify a deposit
```bash
curl -sS -X POST http://127.0.0.1:4000/deposits/verify \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"txHash":"0x<base_tx_hash>"}'
```

## Expected result/status transitions
- API response status field:
  - `accepted` (new credit)
  - `already_credited` (idempotent replay)
- `public.deposit_verification_attempts.status`:
  - `accepted` or `rejected`
- `public.chain_deposits.tx_status`:
  - recorded as `confirmed` for credited deposit.

## Inspect records
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, tx_hash, tx_status, amount, journal_id, verified_at from public.chain_deposits order by verified_at desc limit 30;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, tx_hash, status, reason, metadata, created_at from public.deposit_verification_attempts order by created_at desc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, journal_kind, reference, metadata, created_at from public.ledger_journals where journal_kind='deposit_confirmed' order by created_at desc limit 30;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_id, account_code, direction, amount, currency from public.ledger_entries where journal_id in (select id from public.ledger_journals where journal_kind='deposit_confirmed') order by created_at desc limit 60;"
```

## Rollback / containment
- If failures spike: stop sending `/deposits/verify` requests until RPC/env is fixed.
- Do **not** edit existing `chain_deposits` rows.
- If wrong credit occurred: add compensating `reconciliation_adjustment` journal; keep original rows as evidence.
