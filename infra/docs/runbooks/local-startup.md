# Runbook: Local startup

## Prereqs
- `pnpm`, `node`, `curl` installed.
- Supabase CLI installed (`supabase`).
- `.env.local` (or `.env`) populated.

## Bring up the stack
- Install deps:
  ```bash
  pnpm install
  ```
- Validate env + tools:
  ```bash
  ./infra/scripts/check-env.sh
  ```
- Start local Supabase:
  ```bash
  supabase start
  ```
- Reset + seed DB + run DB happy-path verification:
  ```bash
  pnpm db:reset
  ```
- Start all app/services (web + api + ws + workers):
  ```bash
  pnpm dev
  ```

## Alternative startup
- API + WS only:
  ```bash
  pnpm dev:api
  ```
- Workers only:
  ```bash
  pnpm dev:workers
  ```
- Web only:
  ```bash
  pnpm dev:web
  ```

## Health checks
```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/ready
curl -fsS http://127.0.0.1:4001/health
pnpm smoke:local
```

Expected:
- API health: `ok: true`.
- API ready: `ready: true`.
- WS health: `ok: true`.
