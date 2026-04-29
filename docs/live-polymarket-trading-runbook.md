# Live Polymarket Trading Runbook

## Status

Live routed trading is **disabled by default and not currently safe to enable**. The blocker is not the submitter adapter; it is the missing production-proven user-owned signing flow and secure user L2 credential storage/derivation.

## Required Env Vars

```env
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLY_BUILDER_CODE=
POLYMARKET_ROUTED_TRADING_ENABLED=false
POLYMARKET_CLOB_SUBMITTER=disabled
```

Never add platform-owned `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE`, private keys, or user L2 secrets to client-side env vars.

## Staging Activation Checklist

1. Legal/compliance approval is recorded for the staging jurisdiction.
2. `POLY_BUILDER_CODE` is configured from the Polymarket Builder profile.
3. User L2 credentials are generated or imported only through a user-owned flow.
4. Persisted L2 credentials are encrypted at rest and never logged.
5. The frontend signs a CLOB V2 order with `builderCode` already included.
6. The server verifies the V2 order signature and confirms signer equals the authenticated linked wallet.
7. The route validates market source, open/tradable state, token/outcome mapping, tick size, negative risk, minimum size, order type, expiration, and market-order slippage guard.
8. `POLYMARKET_CLOB_SUBMITTER=real` is set only in staging.
9. `POLYMARKET_ROUTED_TRADING_ENABLED=true` is set only after all previous checks pass.
10. Focused tests pass for `@bet/service-api`, `@bet/web`, and `@bet/integrations`.

## Builder Attribution Verification

Before a controlled staging order:

- Inspect the prepared order input and confirm `builderCode` equals `POLY_BUILDER_CODE`.
- Inspect the signed order and confirm the V2 `builder` field equals the same bytes32 value.
- Reject the order if Builder Code is added only after signing.

After a controlled staging fill:

- Use Polymarket CLOB/chain data to inspect the V2 `OrderFilled` event.
- Confirm the event `builder` field equals `POLY_BUILDER_CODE`.
- Confirm Builder-fee reward accounting records only attribution/reward rows, not internal trading balances.

## No Custody / No Internal Ledger Mutation

Verification commands:

```sh
rg -n "@bet/(ledger|trading)|ledger_journals|ledger_entries|balanceDeltas|rpc_place_order" services/api/src/modules/external-polymarket-routing apps/web/src/app/external-markets
pnpm --filter @bet/service-api test -- src/server.external-polymarket-routing.test.ts
```

Expected result:

- No external Polymarket routing module imports internal ledger or matching mutation modules.
- Polymarket routed order submission does not insert or update internal balances, ledger journals, deposits, withdrawals, claims, or matching state.

## Manual Payout Boundary

Builder-fee attribution can create reward accounting entries after confirmation. Reward payout remains a manual/admin-approved workflow:

1. User requests payout.
2. Admin reviews and approves.
3. Admin marks approved payout paid, failed, or cancelled.

No automatic reward payout transfer should be enabled as part of Polymarket routed trading.

## Rollback

Immediate rollback:

```env
POLYMARKET_ROUTED_TRADING_ENABLED=false
POLYMARKET_CLOB_SUBMITTER=disabled
```

Then redeploy API and web. No balance repair should be needed because external Polymarket routed trading must not mutate internal balances or ledger records.
