# Supabase Auth Architecture

Supabase Auth is the source of truth for app identity.

## Environment Variables

- Browser-safe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only service client: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Standalone API token verification uses the server-only service client to call `auth.getUser(accessToken)`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, database URLs, JWT secrets, private keys, signatures, refresh tokens, or passphrases to the frontend.

## Web App

- Browser/client components use `apps/web/src/lib/supabase/client.ts`.
- Server components, server actions, and route handlers use `apps/web/src/lib/supabase/server.ts` or `@bet/supabase` with `@supabase/ssr` cookies.
- `apps/web/src/lib/supabase/middleware.ts` refreshes sessions and redirects private routes to `/login?next=...`.
- Public Polymarket browsing and guide pages remain available without login.
- Private routes include `/account`, `/rewards`, `/ambassador`, and `/admin/*`.

## Service API

- `services/api/src/lib/auth/supabase.ts` provides:
  - `getAuthenticatedUser(request)`
  - `requireAuthenticatedUser(request)`
  - `requireAdminUser(request)`
  - `requireServiceAuthForInternalJobs(request)`
  - `assertCommandAllowedForUser(request)`
  - `assertAdminCommandAllowed(request)`
- The API only accepts verified Supabase bearer tokens for command/admin identity.
- Test auth injection is limited to `NODE_ENV === "test"` and cannot be enabled in production.

## Admin Model

Admin authorization is server-side only. The current source of truth is Supabase Auth `app_metadata.role === "admin"`.

Spoofed request headers (`x-admin`, `x-role`, `x-admin-token`) and request body/query flags do not grant admin access.

## Referral Flow

- `?ref=CODE` may be captured before login into pending client/cookie state.
- Final referral attribution writes only occur after verified Supabase login.
- First valid attribution wins.
- Disabled codes and self-referrals are rejected.
- Referral finalization is idempotent and does not overwrite an existing attribution.

## Payout / Reward Flow

- Users can view only their own private reward records.
- Reward payout requests require verified user identity, wallet destination validation, and duplicate-open-payout prevention.
- Admin payout actions require verified admin identity and are auditable.
- Payouts remain manual; no automatic treasury transfer is enabled.

## Polymarket Trading

Routed trading submission requires verified Supabase user identity plus wallet, user signing, L2 credentials, builder code, feature flag, tradable market, and submitter readiness. Missing readiness returns a safe disabled/error reason and does not submit, fake-submit, or mutate internal balances.
