# Launch Safety Kill Switches

These operational controls are intentionally minimal and env-based so operators can quickly disable risky write paths during incidents.

## Where flags live

Set these as environment variables for the relevant service process (local `.env`, Railway/Vercel service env vars, or whatever runtime env manager is used in your deployment).

## Flags

### API (`services/api`)

- `OP_DISABLE_ORDER_PLACEMENT=true`
  - **Effect:** blocks all `POST /orders` requests.
  - **User-facing behavior:** API returns `503` with `order placement is temporarily disabled`.

- `OP_DISABLED_ORDER_MARKET_IDS=<csv>`
  - **Effect:** blocks `POST /orders` only for listed market IDs (exact ID match).
  - **Format:** comma-separated UUIDs, e.g. `OP_DISABLED_ORDER_MARKET_IDS=uuid-1,uuid-2`.
  - **User-facing behavior:** API returns `503` with `order placement is temporarily disabled for this market`.

- `OP_DISABLE_DEPOSIT_VERIFY=true`
  - **Effect:** blocks `POST /deposits/verify`.
  - **User-facing behavior:** API returns `503` with `deposit verification is temporarily disabled`.

- `OP_DISABLE_WITHDRAWAL_REQUEST=true`
  - **Effect:** blocks `POST /withdrawals` (user withdrawal request creation).
  - **User-facing behavior:** API returns `503` with `withdrawal requests are temporarily disabled`.

### External sync worker (`services/external-sync-worker`)

- `OP_DISABLE_EXTERNAL_SYNC_WRITES=true`
  - **Effect:** `runMarketSyncJob` exits before any DB upsert/checkpoint writes.
  - **User-facing behavior:** no direct UI error; external market freshness stops advancing until re-enabled.

### Websocket server (`apps/ws`)

- `OP_DISABLE_WS_BROADCAST=true`
  - **Effect:** suppresses push broadcasts from DB notifications.
  - **User-facing behavior:** websocket clients can still connect and subscribe; snapshot reads still work, but live delta/trade events stop streaming.

## How to toggle safely

1. Set/unset the env var on the target service.
2. Restart/redeploy that service so the process picks up the new env value.
3. Validate behavior via endpoint checks (`503` expected for blocked API flows) or service logs.

## Incident usage guidance

- Prefer **narrowest** control first (per-market order halt) before global order disable.
- Use global order/withdraw/deposit disables when integrity or custody risk is suspected.
- Use websocket broadcast disable if event fanout itself is unstable while keeping market reads available.
