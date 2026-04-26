# Environment configuration matrix (launch hardening)

This matrix defines the minimum env contract for local, staging, and production.

## Classification

### Safe public client vars
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_API_BASE_URL` (optional; used for explicit external API routing)
- `NEXT_PUBLIC_BASE_CHAIN_ID` (84532 for non-production smoke)
- `NEXT_PUBLIC_BASE_EXPLORER_URL`
- `NEXT_PUBLIC_BASE_TREASURY_ADDRESS`
- `NEXT_PUBLIC_BASE_USDC_ADDRESS`
- `NEXT_PUBLIC_BASE_SETTLEMENT_ASSET` (default `USDC`)

### Server-only secrets
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `ADMIN_API_TOKEN`
- `INTERNAL_API_TOKEN`
- `CRON_SECRET`

### Server-only non-secret config
- `SUPABASE_URL`
- `SUPABASE_DB_URL` (preferred) or `DATABASE_URL`
- `API_BASE_URL`
- `BASE_CHAIN_ID` (`84532` Base Sepolia for non-production; `8453` Base mainnet for production)
- `BASE_RPC_URL` (defaults by chain; use private/provider endpoint in shared environments)
- `BASE_WS_URL` (defaults by chain; use private/provider endpoint in shared environments)
- `BASE_EXPLORER_URL` (defaults by chain)
- `BASE_TREASURY_ADDRESS` (0x-prefixed, 20-byte address)
- `BASE_USDC_ADDRESS` (0x-prefixed, 20-byte address)
- `BASE_MIN_CONFIRMATIONS` (positive integer)
- `BASE_RECON_MIN_CONFIRMATIONS` (positive integer)

## Minimum required by environment

### Local development
Required:
- Supabase URLs/keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- DB: `SUPABASE_DB_URL` or `DATABASE_URL`
- API/runtime: `API_BASE_URL`, `NEXT_PUBLIC_WS_URL`, `ADMIN_API_TOKEN`
- Base: `BASE_CHAIN_ID`, `BASE_RPC_URL`, `BASE_WS_URL`, `BASE_EXPLORER_URL`, `BASE_TREASURY_ADDRESS`, `BASE_USDC_ADDRESS`, `BASE_MIN_CONFIRMATIONS`, `BASE_RECON_MIN_CONFIRMATIONS`

### Staging
Required (no placeholders):
- all Local requirements
- `CRON_SECRET` for Vercel cron routes
- `INTERNAL_API_TOKEN` for internal service-to-service paths

### Production
Required (no placeholders, rotation-ready):
- all Staging requirements
- ensure `NODE_ENV=production`
- no implicit dev defaults are allowed for admin token, DB URL, WS URL, or Base addresses

## Service-level minimums

### `services/api`
- `SUPABASE_DB_URL` or `DATABASE_URL`
- `API_BASE_URL`
- `ADMIN_API_TOKEN`
- `BASE_CHAIN_ID`, `BASE_RPC_URL`, `BASE_WS_URL`, `BASE_EXPLORER_URL`
- `BASE_TREASURY_ADDRESS`, `BASE_USDC_ADDRESS`
- `BASE_MIN_CONFIRMATIONS`, `BASE_RECON_MIN_CONFIRMATIONS`

### `apps/web` (server runtime)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WS_URL`
- `API_BASE_URL` (required for server-rendered API reads like `/external-markets`)
- `NEXT_PUBLIC_API_BASE_URL` (optional; required only for browser-side direct API reads)
- `ADMIN_API_TOKEN` (for admin server actions)

### `apps/ws`
- `SUPABASE_DB_URL` or `DATABASE_URL`

### Workers
- `SUPABASE_DB_URL` or `DATABASE_URL`
- Base-aware workers additionally require `BASE_CHAIN_ID`, `BASE_RPC_URL`, and relevant confirmation values (`BASE_WS_URL` / `BASE_EXPLORER_URL` recommended for tooling and dashboards)

## Secret rotation notes

- Rotate one secret at a time and validate against `/ready` and launch smoke checks before rotating the next.
- For `ADMIN_API_TOKEN` and `CRON_SECRET`, deploy code that accepts the new value before removing the old one.
- Rotate Supabase service role and JWT secrets during a controlled window; re-run DB + API smoke checks after rotation.
- After any rotation, run:
  - `./infra/scripts/check-env.sh`
  - `pnpm smoke:db` (or CI equivalent)

## Pre-deploy checklist

1. Populate envs in Vercel/Railway (staging first, then production).
2. Confirm no value is `replace-me` / `changeme`.
3. Confirm Base addresses and chain ID match the target network.
4. Confirm `BASE_CHAIN_ID` matches target network (`84532` for staging/smoke/prelaunch, `8453` for production).
5. Confirm `BASE_RPC_URL`/`BASE_WS_URL` point to intended provider endpoints (public endpoints are rate-limited).
6. Run readiness + smoke checks.
