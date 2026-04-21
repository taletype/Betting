# Runbook: Base Sepolia end-to-end smoke (v1 launch slice)

## Scope
This runbook validates the Base-only v1 vertical slice:
1. Connect Base wallet in web
2. Link wallet
3. Verify Base Sepolia USDC deposit tx
4. Place + cross order
5. Resolve market
6. Claim
7. Request withdrawal
8. Admin execute/fail withdrawal

## Required env
- Fill `.env` from `.env.example`.
- Keep `BASE_CHAIN_ID=84532` and set the matching `NEXT_PUBLIC_BASE_*` values.
- Set valid `BASE_TREASURY_ADDRESS` and `BASE_USDC_ADDRESS`.
- Set `SUPABASE_DB_URL`/`DATABASE_URL` for target DB.

## Launch all services
```bash
pnpm dev
```

For split-process launch:
```bash
pnpm dev:web
pnpm dev:api
pnpm dev:ws
pnpm dev:workers
```

## DB-backed smoke harness
```bash
SMOKE_DB_PREP_MODE=none pnpm smoke:base-sepolia
```
- Artifacts are written to `infra/artifacts/smoke-db/latest.log` and `infra/artifacts/smoke-db/latest.json`.
- The script fails loudly if DB connectivity/env prerequisites are missing.

## Web wallet + deposit flow notes
- Portfolio page uses **Base only** wallet connect (no chain selector).
- Wallet must be on chain `84532` for smoke runs.
- Deposit UX expects an existing onchain tx hash to treasury; tx broadcast is performed in wallet app.
