# Bet Monorepo

Prediction market monorepo scaffold for Next.js on Vercel, Supabase, deterministic workers, and append-only ledger-based balance accounting.

## Workspace Layout

- `apps/web`: Next.js frontend and Vercel cron routes
- `apps/ws`: websocket server
- `services/*`: API and worker processes
- `packages/*`: shared domain, contracts, ledger, chain, integrations, config
- `supabase/*`: local Supabase config, migrations, seed data, edge functions
- `infra/*`: local helper scripts and operational docs

## Local Development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Start the web app:

   ```bash
   pnpm --filter @bet/web dev
   ```

4. Run workspace typecheck:

   ```bash
   pnpm typecheck
   ```

5. Start local Supabase as needed:

   ```bash
   supabase start
   ```

## Notes

- Money, quantities, balances, and payouts use integers only.
- Balance changes must flow through append-only ledger journals and entries.
- External market sync stays read-only and never mutates balances directly.
- Chain support is adapter-shaped; Base comes first and Solana remains a stub surface for later work.
