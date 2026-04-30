# Polymarket routed-trading beta checklist

Use this checklist for the first one-user allowlisted beta. Do not use it to enable public live trading.

## Vercel environment

Set:

- `POLYMARKET_ROUTED_TRADING_ENABLED=false`
- `POLYMARKET_ROUTED_TRADING_BETA_ENABLED=true`
- `POLYMARKET_ROUTED_TRADING_ALLOWLIST=<one beta user id or email>`
- `POLY_BUILDER_CODE=<0x-prefixed bytes32 Builder Code>`
- `POLYMARKET_CLOB_SUBMITTER=real` only after submitter health is verified
- `POLYMARKET_CLOB_URL=https://clob.polymarket.com`, unless an approved endpoint is required
- `POLYMARKET_USER_SIGNATURE_VERIFIER_IMPLEMENTED=true` only when real user-signature verification is live
- `POLYMARKET_L2_CREDENTIAL_LOOKUP_IMPLEMENTED=true` only when user-owned L2 credential lookup is live
- `POLYMARKET_GEOBLOCK_PROOF_VERIFIER_IMPLEMENTED=true` only when server-side region proof verification is live
- `POLYMARKET_ROUTED_ORDER_AUDIT_DISABLED=false`

Never set `POLYMARKET_ROUTED_TRADING_ENABLED=true` for the first beta. Do not set platform-owned Polymarket API key, secret, or passphrase env vars for user trading. The submitter must use only the beta user's own L2 credentials.

## Allowlist one user

1. Put exactly one user id or email in `POLYMARKET_ROUTED_TRADING_ALLOWLIST`.
2. Keep the public flag false.
3. Open `/admin/polymarket` as an admin and confirm:
   - public routed trading enabled: `no`
   - beta routed trading enabled: `yes`
   - current user allowlisted: expected yes/no
   - Builder Code configured: `yes`
   - submitter ready: `yes`
   - attribution recording ready: `yes`
   - last readiness failure reason is either `none` or an expected pre-submit check

## Negative checks

- Non-allowlisted user: sign in as a different user and verify the trade ticket/preflight reports `beta_user_not_allowlisted`.
- Allowlisted user with missing checks: temporarily remove `POLY_BUILDER_CODE` or set `POLYMARKET_CLOB_SUBMITTER=disabled`; verify browsing still works and submit remains disabled with the matching reason.
- Browsing: `/`, `/polymarket`, a market detail page, `/ambassador`, and `/rewards` must load without Builder Code.

## Wallet and L2 credentials

1. The beta user connects their own wallet and completes the wallet-link challenge.
2. The beta user generates or supplies their own Polymarket L2 API credentials through the approved credential flow.
3. Confirm the server retrieves only user-scoped L2 credentials for that user and wallet.
4. Do not use platform-owned credentials, private keys, or server signatures to trade for the user.

## Tiny beta order

Submit a tiny beta order only when legal, compliant, and operationally safe:

1. Confirm the market is open, not stale, and tradable.
2. Confirm the user is outside restricted regions using the server-side proof.
3. Confirm balance and allowance checks pass.
4. Confirm the order payload includes the Builder Code before the user signs.
5. The user signs the order with their own wallet/session.
6. Submit through the signed-order route.
7. Confirm the routed-order audit row records Builder attribution without secrets or full signatures.

## Builder attribution and rewards

- Confirm Builder-fee evidence from Polymarket before moving any reward from pending to payable.
- Unconfirmed Builder attribution must not create payable rewards.
- Failed submits must not create rewards.
- Payouts remain manual/admin-approved. Do not enable automatic payouts.

## Rollback

1. Set `POLYMARKET_ROUTED_TRADING_BETA_ENABLED=false`.
2. Keep `POLYMARKET_ROUTED_TRADING_ENABLED=false`.
3. Clear `POLYMARKET_ROUTED_TRADING_ALLOWLIST`.
4. Set `POLYMARKET_CLOB_SUBMITTER=disabled` or remove submitter env.
5. Verify the trade button/preflight returns to disabled.
6. Verify `/polymarket` and market detail browsing still work.
7. Leave rewards pending/non-paying unless Builder-fee evidence is confirmed and an admin manually approves payout.

