# Supabase Magic-Link Auth

Magic-link auth is used for account, referral, and rewards features. Public market browsing must keep working without login.

## Required Supabase Redirect URLs

- Production: `https://betting-web-ten.vercel.app/auth/callback`
- Local: `http://127.0.0.1:3000/auth/callback`

If local development uses a different port, add that exact callback URL in the Supabase Auth dashboard as well.

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` only on the server side; never expose it in frontend code.

Production magic links build their origin from `NEXT_PUBLIC_SITE_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`. If none are present in production, sending the link fails safely instead of emitting `127.0.0.1`.

## Flow

1. `/login` accepts an email, safe `next`, and optional `ref`.
2. `sendMagicLinkAction` calls `signInWithOtp` with `options.emailRedirectTo` set to `/auth/callback?next=...&ref=...`.
3. `/auth/callback` supports both `code` exchange and `token_hash` verification for valid Supabase email OTP types.
4. On success, the Supabase server client writes response cookies, then redirects to the safe `next`.
5. Pending referral is applied after `getUser()` confirms the session. Referral failure does not block login or browsing.
6. Malformed or terminal referral cookies are cleared.

`normalizeAuthNextPath` blocks external URLs and only allows known app destinations such as `/account`, `/rewards`, `/ambassador`, `/polymarket`, and `/polymarket/[slug]`.

## Referral Preservation

For `/polymarket?ref=CODE`, login links should use `/login?next=/polymarket&ref=CODE`. The magic link returns to `/polymarket`, keeps the referral code available to the callback, and applies it after session creation.

Wallet connection remains separate from Supabase auth: wallet is for signing and funding, Supabase login is for referral, rewards, and account state.
