# Feature-First Status Map (v1 scaffold pass)

## Status legend
- live
- scaffolded
- mocked
- disabled
- blocked
- needs hardening

## Product status
- Polymarket Builder routing: **disabled** by default (`POLYMARKET_ROUTED_TRADING_ENABLED=false`), UI scaffolded with readiness gates.
- Base deposit/withdrawal: **scaffolded** status pages and ops runbooks exist.
- Internal trading: **live/scaffolded split** (core matching/ledger unchanged in this pass).
- Claims: **live** user page with admin/ops dependencies.
- Auth/admin gating: **live** and unchanged.
- Reconciliation: **scaffolded** admin surface + worker/runbooks.

## Mock/dev adapters
- External routed submission mode is explicit (`disabled`/`mock`/`live`) and should remain non-live until hardening.
- Mock mode must log warnings and never mutate internal balances from external exchange fills.

## Known blockers before launch
- Production-safe Polymarket credential UX and wallet signature flow.
- End-to-end reconciliation and dispute handling hardening.
- Final launch kill-switch rehearsal and operational playbook sign-off.
- Security review for all internet-facing command routes.
