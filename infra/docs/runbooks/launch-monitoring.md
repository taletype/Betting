# Runbook: Launch monitoring (minimal)

This is a **practical launch-day monitoring map** for the current stack.
It intentionally avoids vendor-specific dashboards/alerts.

## 1) Metric and log hooks added

### Orders and matching
- `orders_accepted_total`
- `orders_rejected_total` (label: `reason`)
- `order_matching_success_total`
- `order_matching_failures_total` (label: `reason`)
- `trades_persisted_total`
- `trade_persistence_failures_total`
- `order_fill_latency_ms` (logged as `order fill latency`, field `durationMs`)

### Claims
- `claims_success_total`
- `claims_failure_total` (label: `reason`)

### Deposits
- `deposit_verification_success_total` (label: `status`)
- `deposit_verification_failure_total` (label: `reason`)

### Withdrawals
- `withdrawal_requests_total`
- `withdrawal_request_failures_total` (label: `reason`)
- `withdrawal_completions_total`
- `withdrawal_completion_failures_total` (label: `reason`)
- `withdrawal_failures_total`
- `withdrawal_failure_processing_errors_total` (label: `reason`)

### Reconciliation
- `reconciliation_pass_total`
- `reconciliation_fail_total`
- `reconciliation_drift_count` (gauge)

### Websocket + realtime reliability
- `websocket_connections_total` (label: `event` = `opened|closed|errored`)
- `websocket_subscribe_failures_total`
- `websocket_notification_failures_total`
- `websocket_resync_events_total` (buffered flushes)
- Client logs:
  - `market.websocket.sequence_gap_detected`
  - `market.websocket.resync_requested`
  - `market.websocket.resync_completed`
  - `market.websocket.resync_failed`

### Worker loop failures and external sync
- `worker_loop_failures_total` (label: `worker`)
- `external_sync_runs_total` (labels: `source`, `status`)
- `external_sync_duration_ms` (duration)
- `external_sync_markets_synced` (gauge)
- `external_sync_lag_ms` (gauge; time since prior checkpoint)

---

## 2) Minimal dashboard panels

Use any metrics backend/log query tool already in place. Keep to these core panels.

1. **Order throughput**
   - Chart: rate of `orders_accepted_total` and `orders_rejected_total`.
2. **Fill latency**
   - Chart: p50/p95 from `order_fill_latency_ms.durationMs`.
3. **Claim failures**
   - Chart: rate of `claims_failure_total`.
4. **Deposit verification failures**
   - Chart: rate of `deposit_verification_failure_total` and success/failure ratio.
5. **Withdrawal failures**
   - Chart: rate of `withdrawal_request_failures_total`, `withdrawal_completion_failures_total`, `withdrawal_failure_processing_errors_total`.
6. **Reconciliation drift**
   - Chart: `reconciliation_drift_count` and count of `reconciliation_fail_total`.
7. **Websocket connection/resync**
   - Chart: `websocket_connections_total{event="opened"}`, `websocket_connections_total{event="errored"}`, `websocket_resync_events_total`.
8. **External sync lag**
   - Chart: `external_sync_lag_ms` and `external_sync_duration_ms` by `source`.

---

## 3) Alert thresholds (launch defaults)

Tune after 3-7 days of baseline.

## Page immediately (high urgency)
- `reconciliation_fail_total` increments at all.
- `reconciliation_drift_count > 0` for 2 consecutive runs.
- `worker_loop_failures_total{worker="matching-worker"}` increases 3+ times in 5 minutes.
- `worker_loop_failures_total{worker="external-sync-worker"}` increases 2+ times in 15 minutes.
- `withdrawal_completion_failures_total` increases 3+ times in 10 minutes.
- `deposit_verification_failure_total` failure ratio > 50% over 10 minutes with at least 10 attempts.
- `websocket_notification_failures_total` increases 5+ times in 5 minutes.

## Daily review only (non-paging)
- `orders_rejected_total` trend by `reason`.
- p95 `order_fill_latency_ms` drifting up day-over-day.
- `claims_failure_total` low non-zero background errors.
- `websocket_resync_events_total` trend (identify noisy clients/markets).
- `external_sync_lag_ms` temporarily elevated but < 60 minutes.

---

## 4) Operator quick map

When something alerts:
1. Confirm failing metric/log event.
2. Check related tables for backlog/state:
   - `matching_commands`, `withdrawals`, `deposit_verification_attempts`, `market_realtime_sequences`, `external_sync_checkpoints`.
3. Use existing reconciliation report output to isolate ledger/treasury mismatches.
4. Contain risk first (pause risky admin mutation paths) before repair.

This runbook is intended for launch operations only; expand later only when sustained load requires it.
