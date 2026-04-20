# Launch Load Harness (Narrow)

This harness is a **small, repeatable launch confidence check** for the highest-value runtime paths:

- market reads
- orderbook + recent trades reads
- controlled order-placement bursts
- websocket subscription fan-in

It intentionally avoids full-scale performance platform complexity.

## Preconditions

1. Local or staging environment is running with API + WS available.
2. Database is seeded with at least one open market and one outcome.
   - Local fast path:
     - `supabase start`
     - `pnpm db:reset`
     - `pnpm dev:api`
3. Target URLs are reachable:
   - API: `http://127.0.0.1:4000`
   - WS: `ws://127.0.0.1:4001/ws`

## Run

From repo root:

```bash
pnpm load:launch
```

Or with explicit overrides:

```bash
pnpm load:launch \
  --apiBaseUrl=http://127.0.0.1:4000 \
  --wsUrl=ws://127.0.0.1:4001/ws \
  --marketId=11111111-1111-4111-8111-111111111111 \
  --outcomeId=22222222-2222-4222-8222-222222222222 \
  --readRequests=300 \
  --readConcurrency=30 \
  --orderBurstCount=80 \
  --orderBurstConcurrency=20 \
  --wsClients=40 \
  --wsRuntimeMs=8000
```

### Optional environment variable equivalents

- `LOAD_API_BASE_URL`
- `LOAD_WS_URL`
- `LOAD_MARKET_ID`
- `LOAD_OUTCOME_ID`
- `LOAD_READ_REQUESTS`
- `LOAD_READ_CONCURRENCY`
- `LOAD_ORDER_BURST_COUNT`
- `LOAD_ORDER_BURST_CONCURRENCY`
- `LOAD_ORDER_PRICE`
- `LOAD_ORDER_QUANTITY`
- `LOAD_WS_CLIENTS`
- `LOAD_WS_RUNTIME_MS`

## What is measured

For each phase the script prints:

- request count
- success count
- error count
- latency summary (`min`, `p50`, `p95`, `avg`, `max`)
- threshold result (`PASS`/`FAIL`)

Phases:

1. `GET /markets`
2. `GET /markets/:marketId`
3. `GET /markets/:marketId/orderbook`
4. `GET /markets/:marketId/trades`
5. `POST /orders` burst against seeded market/outcome
6. websocket fan-in connect + subscribe to `orderbook` and `trades`

## Good-enough launch target

A run is considered good enough when all phases pass their default thresholds:

- **Read phases**: error rate `<= 1%`, p95 latency `<= 300ms`
- **Order burst**: error rate `<= 2%`, p95 latency `<= 500ms`
- **WS fan-in**: error rate `<= 2%`, p95 connect latency `<= 500ms`

If one phase fails, treat it as a launch-blocking signal until investigated.

## Notes

- This harness is intentionally narrow and practical; it is not a soak test and not a long-running benchmark suite.
- Order bursts use small default notional (`price=50`, `quantity=1`) to reduce collateral pressure during repeated runs.
