# Operator Guide: Builder-Fee Reward Payouts

This guide covers manual/admin-approved payout operations for rewards funded from confirmed Polymarket Builder-fee revenue.

## Fee Disclosure

- Pending Builder maker fee: 0.5% / 50 bps.
- Pending Builder taker fee: 1.0% / 100 bps.
- Use "pending" language until Polymarket confirms the rates are active in the Builder profile.
- Builder fees apply only to eligible routed Polymarket orders where our builderCode is attached and the order matches.
- If builderCode is missing, there is no Builder-fee attribution.
- Builder fees are additive to Polymarket/platform fees.
- Browsing markets does not create Builder fees.

## Reward Split

Rewards are calculated only from confirmed Builder-fee revenue.

- Platform: 60%.
- Direct referrer: 30%.
- Trader cashback: 10%.
- If no direct referrer exists, the referrer share goes to platform.
- Rewards are direct-referral only. There is no recursive reward tree.
- There is no profit guarantee.

## Payout Rail

- Chain: Polygon.
- Asset: pUSD.
- Destination: user-provided Polygon-compatible 0x wallet address.
- Payouts remain manual and admin-approved.
- There is no automatic treasury transfer.
- The app must not add custody or mutate internal balances from external Polymarket activity.

## Payout State Machine

- `requested`: user requested a payout review.
- `approved`: admin approved the request for manual payment.
- `paid`: admin completed Polygon pUSD payment and recorded the Polygon transaction hash.
- `failed`: admin marked the request failed with notes.
- `cancelled`: admin cancelled the request with notes.

Allowed operator path:

1. `requested` -> `approved`.
2. `approved` -> `paid`.
3. `requested` or `approved` -> `failed`.
4. `requested` or `approved` -> `cancelled`.

`paid` requires prior approval and a valid 32-byte `0x` Polygon transaction hash.

## Approve A Payout

1. Open the admin payout review surface.
2. Confirm the payout is `requested`.
3. Confirm rewards are payable and based on confirmed Builder-fee revenue.
4. Confirm the destination is a valid 0x wallet address and the user intends to receive on Polygon.
5. Add review notes when useful.
6. Click or call the approve action.

Approval does not transfer funds. It only records approval for manual payment.

## Mark Paid

1. Pay the approved amount manually as Polygon pUSD from the operator-controlled wallet.
2. Copy the Polygon transaction hash.
3. In admin, mark the approved payout as paid.
4. Paste the transaction hash and save.
5. Verify the stored hash links to the configured Polygon explorer.

Never mark a payout paid before a real manual transfer is complete.

## Void Suspicious Trade Attribution

Void a Builder trade attribution when it is duplicated, fraudulent, missing required Builder attribution, not matched, linked to a disabled/self referral, or otherwise inconsistent with confirmed Polymarket Builder-fee revenue.

1. Open the admin trade attribution record.
2. Review order ID, trade ID, user ID, direct referrer, notional, Builder fee atoms, source payload, and timestamps.
3. Add a specific reason.
4. Mark the attribution void.
5. Confirm related reward ledger entries move to `void`.

Voiding prevents suspicious rewards from becoming payable.

## Operator Guardrails

- Do not enable live trading until readiness is complete.
- Do not enable automatic crypto payouts.
- Do not transfer treasury funds automatically from the app.
- Do not add custody.
- Do not describe the platform as trading for users.
- Do not create multi-level, recursive, or passive reward claims.
- Do not commit secrets.
