# Runbook: Websocket recovery basics

## Service basics
- WS endpoint: `ws://127.0.0.1:4001/ws`
- Health: `GET http://127.0.0.1:4001/health`
- Source of sequence truth: `public.market_realtime_sequences.sequence`

## Recovery checklist for event gaps
1. Check WS health:
   ```bash
   curl -fsS http://127.0.0.1:4001/health
   ```
2. Check market sequence heads:
   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, updated_at from public.market_realtime_sequences order by updated_at desc limit 30;"
   ```
3. Check latest trades/sequence continuity:
   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, sequence, matched_at from public.trades order by matched_at desc, sequence desc limit 100;"
   ```
4. Restart WS process.
5. Force clients to re-subscribe (`market.subscribe`) so snapshot + buffered deltas are rebuilt.

## Containment
- If sequence drift persists, restart matching worker too.
- If still inconsistent, temporarily disable realtime clients and fall back to REST market/orderbook/trades endpoints.
