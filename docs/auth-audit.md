# Auth Audit

Last updated: 2026-04-30

## Unsafe Paths Found

- `services/api/src/server.ts` accepted `x-user-id` outside production and fell back to `DEMO_USER_ID` in non-production command paths. This affected orders, claims, portfolio, wallet linking, deposits, withdrawals, ambassador dashboard, referral capture, payout requests, and Polymarket routed order submission.
- `services/api/src/server.ts` used `x-admin-token` for admin routes. This affected external sync, market resolution, withdrawal execution/failure, ambassador overview, referral overrides, code management, mock trade attribution, reward payable/void actions, and payout approval/paid/failed/cancelled actions.
- `apps/web/src/lib/api.ts` forwarded `API_REQUEST_USER_ID` and `API_REQUEST_ADMIN_TOKEN` as privileged request headers. These are no longer used for backend identity.
- `services/api/src/server.ts` accepted admin actor ids from spoofable header fallback or demo constants for some admin audit fields.
- Several runbooks still document old local curl examples with `x-user-id` or `x-admin-token`; treat those examples as deprecated until updated.

## Public Read-Only

- Landing and guide pages.
- `/polymarket`, `/polymarket/[slug]`, `/external-markets`, market lists/details.
- Read-only market APIs: `/markets`, `/markets/:id`, `/markets/:id/orderbook`, `/markets/:id/trades`, `/external/markets`, external orderbook/trades.
- Pending referral capture from `?ref=CODE` into local/cookie client state.

## Command / User Paths

These require verified Supabase Auth user identity:

- Account/session-backed data.
- Portfolio, claims, deposits, withdrawals, orders, wallet linking.
- Ambassador dashboard private data.
- Referral finalization.
- Reward payout request.
- Polymarket routed order submission.

## Admin Paths

These require verified Supabase Auth user with `app_metadata.role = "admin"`:

- Admin external sync trigger.
- Admin market resolution.
- Admin withdrawal review and execution/failure.
- Admin ambassador overview and exports.
- Referral override, code enable/disable, mock attribution, reward payable/void, payout approve/paid/failed/cancelled.

## Replacement Status

- Standalone service API now uses `Authorization: Bearer <Supabase access token>` and verifies the token with Supabase Auth server-side.
- Web server/API proxy uses Supabase SSR cookies and forwards bearer tokens to separate API deployments.
- Spoofable `x-user-id`, `x-admin`, `x-role`, and request body `userId` are not accepted as backend identity.
- Service-role Supabase client remains server-only and is not used as a user/admin identity shortcut.
