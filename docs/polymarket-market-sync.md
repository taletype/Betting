# Polymarket Market Sync

The Polymarket market cache is read-only market-data ingestion. It uses public Gamma API responses from `gamma-api.polymarket.com`; it does not scrape `polymarket.com`, does not call private trading endpoints, and does not submit or affect live orders.

## Feeds

- Smart Feed: small, frequent sync for high-quality open markets used by default public discovery views.
- All Markets: broader active-market sync for `/polymarket?view=all` and `/external/markets?view=all`.
- Archive Sync: closed-market sync for historical visibility. Archive runs can be large and should stay batched.

## Job Route

`/api/jobs/sync-polymarket` is protected by the existing cron secret convention. Call it with `Authorization: Bearer $CRON_SECRET` or `x-cron-secret: $CRON_SECRET`.

Supported query params:

- `mode=smart|all_open|archive_closed|all`
- `pageSize=100`
- `maxPages=5`
- `maxMarkets=1000`
- `offset=0`

The default job is timeout-safe: `mode=all_open&pageSize=100&maxPages=5&maxMarkets=1000&offset=0`. The response includes `nextOffset`; if it is not `null`, the next run can continue with `offset=<nextOffset>`. A sync is complete when `completed=true` and `nextOffset=null`.

## Recommended Cron Cadence

- Smart sync: every 1-5 minutes.
- All open sync: batched every 5-15 minutes, carrying forward `nextOffset` until complete.
- Archive closed sync: hourly or daily, batched with the same offset pattern.

Avoid configuring a single cron to fetch 50 pages in one Vercel function invocation. Use bounded batches so route execution stays within `maxDuration`.

## Diagnostics

Each run stores diagnostics in `external_market_sync_runs.diagnostics`:

- `syncMode`
- `startedAt`
- `finishedAt`
- `durationMs`
- `pagesFetched`
- `rawRecordsSeen`
- `uniqueMarkets`
- `marketsUpserted`
- `startOffset`
- `nextOffset`
- `maxPagesReached`
- `maxMarketsReached`
- `completed`
- `privateTradingEndpointsUsed=false`
- `upstream=gamma-api.polymarket.com`

## Limitations

The cache reader currently filters and sorts in memory over a 10,000-row read window. This is acceptable while active full sync remains capped at `maxMarkets <= 5000`. If archive ingestion grows beyond 10,000 cached rows, move filtering, sorting, and pagination into database queries.

Live trading remains separately gated by the Polymarket routing preflight and kill-switch controls; market sync does not change that gate.

## Tradability Flags

Sync stores first-class Polymarket status flags in `source_provenance.statusFlags`, including `active`, `closed`, `archived`, `cancelled`, `acceptingOrders`, `enableOrderBook`, `restricted`, and upstream end dates when available. Public readers use these flags before falling back to old close-time inference, so a market with live `active=true`, `closed=false`, and order acceptance/orderbook signals is not mislabeled as closed only because a legacy date is old.
