# Deprecated Surfaces

This cleanup pass classifies legacy product/config references so future work can tell what was removed, redirected, or intentionally retained.

## Removed Or Redirected Now

- User navigation no longer links to `/external-markets`; it now links to `/polymarket`.
- `/external-markets` and `/zh-CN/external-markets` redirect to `/polymarket` for compatibility with existing links.
- Environment examples no longer include `SOLANA_RPC_URL`.
- Environment examples no longer ship a concrete `POLY_BUILDER_CODE` value.
- Environment examples now default to Base mainnet production-facing values.
- User-facing wallet/loading copy no longer mentions Base Sepolia testing.
- User-facing market portal copy now presents the surface as Polymarket markets rather than generic external market research.

## Keep Because Test Or Dev Only

- `services/api/src/modules/shared/constants.ts` and DB happy-path scripts still use a demo user for non-production request fallback and seeded lifecycle checks.
- Tests may contain forbidden product terms only as guard lists or negative assertions.
- Base Sepolia smoke scripts and runbooks remain for staging evidence.

## Keep Because Base Sepolia Staging Only

- `pnpm smoke:base-sepolia`
- `infra/scripts/smoke-base-sepolia.sh`
- `infra/scripts/smoke-launch-proof.sh`
- `infra/docs/runbooks/base-sepolia-smoke.md`
- `infra/docs/runbooks/staging-launch-drill.md`
- Base Sepolia support in `packages/config/src/baseNetwork.ts`
- `BASE_SEPOLIA_CHAIN_ID=84532` references used by smoke/dev scripts

## Keep Because Internal Core Still Needs It

- `external_markets`, `external_outcomes`, `external_trade_ticks`, and related internal module/file names remain database/API implementation names.
- The external-sync worker remains read-only and must not mutate balances, ledger, claims, withdrawals, or matching state.
- Ledger, matching, claims, reconciliation, deposit, and withdrawal invariants remain intact.

## Update Wording Only

- Docs and runbooks should refer users to `/polymarket`.
- Docs should describe the product as zh-HK first, Polymarket-first, Base-only production, direct-referral only, and manual/admin-approved for payouts.
- Polymarket Builder docs should use placeholders for `POLY_BUILDER_CODE`.

## Intentionally Not Added

- No chain picker.
- No generic Ethereum Sepolia production path.
- No Solana user-facing surface.
- No live Polymarket routed trading enablement.
- No automatic payouts.
- No MLM, downline, recursive, package-unlock, passive-income, or guaranteed-profit reward model.

## Uncertain, Leave With TODO

- Legacy internal table/module names containing `external` can be renamed later only with a coordinated migration/API compatibility plan.
- The internal Kalshi sync mapper remains non-canonical for v1 user experience. Remove it in a later pass only after confirming no tests, seed data, or admin sync contracts depend on it.
