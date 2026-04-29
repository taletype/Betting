# Supabase Guard

Supabase Auth remains the source of truth for app identity.

## Rules

- Server routes validate Supabase sessions or bearer tokens before command writes.
- Request headers such as `x-user-id`, `x-user-role`, `x-admin`, and similar values are display/debug input only and are never authority.
- Thirdweb wallet connection does not mean the user is logged in.
- Thirdweb wallet connection does not grant admin access.
- Wallet link writes require a Supabase-authenticated user plus wallet ownership proof bound to that user.
- Service-role Supabase access is server-only and must sit behind an explicit authorization wrapper for user-scoped writes.

## Current Helpers

- Web route handlers: `apps/web/src/app/api/auth.ts`
- Service API: `services/api/src/lib/auth/supabase.ts`

Both expose `getOptionalSupabaseUser`, `requireSupabaseUser`, `requireAdminUser`, `requireUserOwnsReferralCode`, and `requireUserOwnsWallet`.

Protected routes fail closed with `401` for missing auth and `403` for authenticated-but-forbidden requests.
