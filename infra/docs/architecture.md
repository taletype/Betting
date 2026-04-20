# Architecture

- `apps/web` serves the product UI and cron route handlers on Vercel.
- `services/api` holds HTTP endpoint logic for markets, orders, and portfolio.
- Worker services handle matching, settlement, reconciliation, external sync, and candles.
- `packages/ledger` is the only place balance mutations should be modeled.
- `packages/chain` exposes adapters only; concrete chain logic remains intentionally unimplemented.
