# Incident Response Runbooks

Use this during live ops. Prefer containment + evidence collection before remediation.

## 1) Stuck matching queue

### Symptoms

- New orders stay `pending`
- `matching_commands.processed_at` stays `NULL`
- `last_error` grows/repeats

### Triage

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, order_id, created_at, claimed_at, claim_expires_at, processed_at, attempt_count, last_error from public.matching_commands order by created_at asc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, matching_processed_at, created_at from public.orders order by created_at desc limit 50;"
```

### Containment

1. Stop API order intake (or temporarily block `/orders`) to prevent queue growth.
2. Restart matching worker:

```bash
pnpm --filter @bet/matching-worker dev
```

3. Re-check pending command count.

### Recovery

- Commands with expired claims are reclaimable automatically (`claim_expires_at <= now()`).
- For repeatedly failing commands, inspect `last_error`; fix root cause before replay.

---

## 2) Failed reconciliation

### Symptoms

- reconciliation worker exits non-zero / logs failures with check names

### Triage

```bash
pnpm --filter @bet/reconciliation-worker dev
```

Then run targeted SQL:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
```

### Containment

1. Pause risky mutating operations (new trading sessions, manual journals).
2. Preserve evidence: export implicated journals/orders/trades/positions rows.
3. Apply only compensating journals (`reconciliation_adjustment`)—never rewrite history rows.

---

## 3) Broken websocket sequence

### Symptoms

- Clients report gaps/out-of-order events
- frequent re-subscribe loops

### Triage

1. Check websocket health:

```bash
curl -sS http://localhost:4001/health
```

2. Inspect per-market sequence head:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, updated_at from public.market_realtime_sequences order by updated_at desc limit 20;"
```

3. Spot-check trade sequence continuity:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, matched_at from public.trades order by matched_at desc, sequence desc limit 100;"
```

4. Verify WS process is listening to `public_market_events` channel (startup logs).

### Containment

- Restart WS service:

```bash
pnpm --filter @bet/ws dev
```

- If sequence source is suspected, also restart matching worker.
- Prefer forcing clients to resubscribe and consume fresh snapshots.

---

## 4) Failed deposit verification

### Symptoms

- `/deposits/verify` errors
- `deposit_verification_attempts.status='rejected'` spikes

### Triage

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, tx_hash, status, reason, metadata, created_at from public.deposit_verification_attempts order by created_at desc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, tx_hash, tx_sender, tx_recipient, token_address, amount, journal_id, verified_at from public.chain_deposits order by verified_at desc limit 50;"
```

Check API env for `BASE_TREASURY_ADDRESS`, `BASE_RPC_URL`, `BASE_USDC_ADDRESS`, `BASE_MIN_CONFIRMATIONS`.

### Containment

1. Stop further verify requests until root cause is known.
2. Communicate temporary deposit-credit delay to users.
3. Do **not** mutate existing deposit rows.
4. For urgent credits, use reviewed compensating ledger adjustment + audit record.

### Recovery

- Fix env/RPC/network mismatch.
- Re-run verification request for affected tx hashes (idempotent for already-credited tx).
