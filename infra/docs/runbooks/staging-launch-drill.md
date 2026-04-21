# Runbook: Staging launch drill (single go/no-go rehearsal)

This is the **one required staging drill** before launch. It is intentionally operational: no feature work, no optional expansion.

## Scope and objective

Execute one end-to-end lifecycle in staging (or local staging-like environment) and produce evidence for go/no-go:

1. Boot stack
2. Verify `/health` and `/ready`
3. Verify seed/demo setup
4. Link wallet (if needed)
5. Verify deposit credit
6. Place resting order
7. Place crossing order
8. Confirm trade/orderbook/trades state
9. Resolve market
10. Claim payout
11. Request withdrawal
12. Admin execute or fail withdrawal
13. Run reconciliation
14. Verify no critical mismatches

---

## Operators and placeholders

- **Drill Operator (DO):** `<name>`
- **Backend On-call (BE):** `<name>`
- **Ledger/Reconciliation Owner (LE):** `<name>`
- **Release Manager (RM):** `<name>`

Use these placeholders directly in the artifact files if names are not assigned yet.

---

## Artifact directory (required)

- Base directory: `infra/artifacts/launch-drill/`
- Run directory: `infra/artifacts/launch-drill/<UTC timestamp>/`
- Recommended command to initialize and pre-capture:

```bash
pnpm drill:staging
```

`pnpm drill:staging` writes `drill.log`, `commands.log`, DB snapshots, and `manual-checklist.md` into the timestamped run folder.

If you run commands manually, still use the same directory convention and file names from the artifact checklist below.

---

## Staging drill procedure (execution order is mandatory)

### 1) Boot stack

```bash
./infra/scripts/check-env.sh
supabase start
pnpm dev:api
pnpm dev:workers
pnpm dev:web
```

Pass condition:
- Env check passes.
- Services start without crash loops.

### 2) Verify `/health` and `/ready`

```bash
curl -fsS ${API_URL:-http://127.0.0.1:4000}/health
curl -fsS ${API_URL:-http://127.0.0.1:4000}/ready
curl -fsS ${WS_HEALTH_URL:-http://127.0.0.1:4001/health}
```

Pass condition:
- All 3 commands return HTTP 200.

### 3) Verify seed/demo setup

Use seeded demo data and confirm at least one market and outcome exists:

```bash
pnpm db:reset
psql "$DRILL_DB_URL" -c "select count(*)::int as markets from public.markets;"
psql "$DRILL_DB_URL" -c "select count(*)::int as outcomes from public.outcomes;"
```

Pass condition:
- `markets >= 1`
- `outcomes >= 1`

### 4) Link wallet if needed

Check for an existing linked wallet first:

```bash
curl -sS ${API_URL:-http://127.0.0.1:4000}/wallets/linked \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001'
```

If wallet is missing, link one:

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/wallets/link \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"walletAddress":"0x<wallet>","signedMessage":"Bet wallet link\nuser:00000000-0000-4000-8000-000000000001\nnonce:<nonce>","signature":"0x<signature>"}'
```

Pass condition:
- `walletAddress` exists in response and matches expected address.

### 5) Verify deposit credit

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/deposits/verify \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"txHash":"0x<staging_safe_tx_hash>"}'
```

Then confirm DB state:

```bash
psql "$DRILL_DB_URL" -c "select tx_hash, tx_status, amount, journal_id, verified_at from public.chain_deposits order by verified_at desc limit 5;"
psql "$DRILL_DB_URL" -c "select id, journal_kind, reference, created_at from public.ledger_journals where journal_kind='deposit_confirmed' order by created_at desc limit 5;"
```

Pass condition:
- API result is `accepted` or `already_credited`.
- Deposit row is present with `tx_status='confirmed'`.

### 6) Place resting order

Pick an open market/outcome and place non-crossing maker order:

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/orders \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"marketId":"<market_id>","outcomeId":"<outcome_id>","side":"buy","orderType":"limit","price":"40","quantity":"10","clientOrderId":"drill-maker-<ts>"}'
```

Pass condition:
- API returns `202` and order enters open book state.

### 7) Place crossing order

Use a second user to cross the resting order:

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/orders \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000002' \
  -d '{"marketId":"<market_id>","outcomeId":"<outcome_id>","side":"sell","orderType":"limit","price":"40","quantity":"10","clientOrderId":"drill-taker-<ts>"}'
```

Pass condition:
- API returns `202` and trade matching occurs.

### 8) Confirm trade/orderbook/trades state

```bash
psql "$DRILL_DB_URL" -c "select id, side, status, price, remaining_quantity, updated_at from public.orders where market_id='<market_id>' order by updated_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select id, market_id, price, quantity, sequence, matched_at from public.trades where market_id='<market_id>' order by matched_at desc limit 20;"
curl -sS ${API_URL:-http://127.0.0.1:4000}/markets/<market_id>/orderbook
curl -sS ${API_URL:-http://127.0.0.1:4000}/markets/<market_id>/trades
```

Pass condition:
- At least one new `public.trades` row for `<market_id>`.
- Orders reflect fill/remaining updates consistent with matched quantity.

### 9) Resolve market

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/markets/<market_id>/resolve \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -d '{"winningOutcomeId":"<outcome_id>","evidenceText":"staging drill evidence","evidenceUrl":"https://example.com/drill","resolverId":"drill-operator"}'
```

Pass condition:
- Market state is `resolved` and resolution row exists/finalized.

### 10) Claim payout

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/claims/<market_id> \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001'
```

Pass condition:
- Claim status becomes claimed/paid and `claim_payout` journal is present.

### 11) Request withdrawal

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/withdrawals \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"amountAtoms":"1000000","destinationAddress":"0x<destination_wallet>"}'
```

Pass condition:
- Response is `201` and withdrawal status is `requested`.

### 12) Admin execute or fail withdrawal

Execute path:

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/withdrawals/<withdrawal_id>/execute \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -H 'x-user-id: <admin_actor_user_id>' \
  -d '{"txHash":"0x<tx_hash>"}'
```

Fail path:

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/withdrawals/<withdrawal_id>/fail \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -H 'x-user-id: <admin_actor_user_id>' \
  -d '{"reason":"staging drill fail path"}'
```

Pass condition:
- At least one admin action succeeds (execute or fail).
- DB withdrawal row fields match resulting status.

### 13) Run reconciliation

```bash
pnpm --filter @bet/reconciliation-worker dev
```

Capture output and stop after first successful cycle log.

Pass condition:
- No critical reconciliation mismatches reported.

### 14) Verify no critical mismatches

Run and save these snapshots:

```bash
psql "$DRILL_DB_URL" -c "select le.journal_id from public.ledger_entries le group by le.journal_id, le.currency having sum(case when le.direction='debit' then le.amount else 0 end) <> sum(case when le.direction='credit' then le.amount else 0 end);"
psql "$DRILL_DB_URL" -c "select id, status, price, remaining_quantity, reserved_amount, (price*remaining_quantity) as expected_reserved_amount from public.orders where status in ('open','partially_filled') and reserved_amount <> (price*remaining_quantity);"
psql "$DRILL_DB_URL" -c "select id, status, tx_hash, failure_reason, processed_by, processed_at from public.withdrawals order by created_at desc limit 20;"
```

Pass condition:
- No unbalanced journals.
- No reserve mismatch rows.
- Withdrawal state fields consistent with status.

---

## Artifact checklist (required)

Save all artifacts under `infra/artifacts/launch-drill/<UTC timestamp>/`.

### A) Logs
- [ ] `drill.log` (full command output)
- [ ] `commands.log` (exact command order)
- [ ] `db-happy-path.log` (if `pnpm drill:staging` used)
- [ ] `reconciliation.log` (manual capture if run separately)

### B) SQL outputs / JSON payload captures
- [ ] `health.json` and `ready.json`
- [ ] `wallet-linked.json`
- [ ] `deposit-verify.json`
- [ ] `orders-maker.json`
- [ ] `orders-taker.json`
- [ ] `orderbook.json`
- [ ] `trades-api.json`
- [ ] `resolve-market.json`
- [ ] `claim.json`
- [ ] `withdrawal-request.json`
- [ ] `withdrawal-admin-execute.json` or `withdrawal-admin-fail.json`
- [ ] `balances_snapshot.txt`
- [ ] `open_orders_snapshot.txt`
- [ ] `trades_snapshot.txt`
- [ ] `positions_snapshot.txt`
- [ ] `claims_snapshot.txt`
- [ ] `withdrawals_snapshot.txt`
- [ ] `worker_health_matching_commands.txt`
- [ ] `websocket_sequences_snapshot.txt`
- [ ] `external_sync_snapshot.txt`

### C) Screenshots
- [ ] Portfolio page showing linked wallet + balances
- [ ] Market page showing trade reflected in UI
- [ ] Admin view (or terminal evidence) of resolution + withdrawal admin action

### D) Sign-off
- [ ] `manual-checklist.md` completed by DO
- [ ] BE sign-off recorded in `manual-checklist.md`
- [ ] LE sign-off recorded in `manual-checklist.md`
- [ ] RM final go/no-go decision appended at bottom

---

## Go / No-Go checklist (hard gates)

Mark each gate `PASS` or `FAIL`.

### Gate 1 — Platform readiness
- [ ] PASS if `/health`, `/ready`, and WS `/health` are all HTTP 200.
- **FAIL/HOLD** if any endpoint fails more than once after restart attempt.
- **Escalation owner:** BE `<name>`.

### Gate 2 — Seed/demo and wallet readiness
- [ ] PASS if seed counts are present and wallet is linked for drill user.
- **FAIL/HOLD** if demo market/outcome missing or wallet link fails validation.
- **Escalation owner:** DO `<name>`.

### Gate 3 — Funds lifecycle
- [ ] PASS if deposit verify returns accepted/idempotent and deposit ledger evidence exists.
- [ ] PASS if withdrawal request succeeds and at least one admin execute/fail path succeeds.
- **FAIL/HOLD** if deposit credit cannot be proven in DB/journals, or withdrawal state is inconsistent.
- **Escalation owner:** LE `<name>`.

### Gate 4 — Trading lifecycle
- [ ] PASS if resting + crossing orders produce at least one trade and order state updates are consistent.
- [ ] PASS if market resolves and winner can claim payout.
- **FAIL/HOLD** if no trade is created, resolution fails, or claim fails.
- **Escalation owner:** BE `<name>`.

### Gate 5 — Reconciliation integrity
- [ ] PASS if reconciliation run reports no critical mismatches.
- [ ] PASS if manual mismatch SQL checks return zero rows for critical checks.
- **FAIL/HOLD** on any unbalanced journal or reserve/withdrawal state mismatch.
- **Escalation owner:** LE `<name>`.

## Final decision rule

- **GO** only if **all 5 gates are PASS** and artifact checklist is complete.
- **NO-GO/HOLD** if any gate fails or any required artifact is missing.
- Record final decision line:

```text
Decision: GO | NO-GO
Timestamp (UTC): <timestamp>
Release Manager: <name>
Escalated to: <owner(s)>
Notes: <brief>
```
