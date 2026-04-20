# Runbook: Market resolution + claims

## Resolution flow (admin)
Only markets in `open` or `halted` are resolvable.

### Resolve a market
```bash
curl -sS -X POST http://127.0.0.1:4000/admin/markets/<market_id>/resolve \
  -H 'content-type: application/json' \
  -H 'x-admin-token: dev-admin-token' \
  -d '{
    "winningOutcomeId":"<outcome_id>",
    "evidenceText":"settlement source + notes",
    "evidenceUrl":"https://example.com/proof",
    "resolverId":"ops-admin-1"
  }'
```

### Expected resolution transitions
- `public.markets.status`: `open|halted` → `resolved`
- `public.resolutions.status`: upserted/finalized for `market_id`
- `public.resolutions.winning_outcome_id`: set to selected outcome.

## Claims flow (current repo behavior)
- Claim logic exists in API module (`claimMarket`), but there is **no public `/claims` HTTP route** in `services/api/src/server.ts`.
- Operationally, validate claim state through DB and via the DB happy-path script.

### Validate end-to-end resolution + claim path
```bash
pnpm --filter @bet/service-api test:db-happy-path
```

### Inspect records
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, resolved_at from public.markets order by updated_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, market_id, status, winning_outcome_id, evidence_url, resolved_at, updated_at from public.resolutions order by updated_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, user_id, market_id, status, claimable_amount, claimed_amount, resolution_id, updated_at from public.claims order by updated_at desc limit 50;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, journal_kind, reference, metadata, created_at from public.ledger_journals where journal_kind='claim_payout' order by created_at desc limit 30;"
```

## Rollback / containment
- Do not edit `resolutions`, `claims`, or existing payout journals in place.
- If bad resolution was finalized, open incident, halt affected market operations, and post compensating ledger adjustments as needed.
