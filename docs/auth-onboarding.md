# Auth and Onboarding

This scaffold uses Supabase Auth for email OTP / magic-link login when the required Supabase environment variables are configured.

## Login Flow

1. User opens `/login` or `/signup`.
2. The app sends a Supabase magic link.
3. Supabase redirects to `/auth/callback`.
4. The callback exchanges the code for a session cookie.
5. `/account` becomes session-aware and can apply a pending referral code.

Production command paths must use the Supabase session. Spoofable `x-user-id` headers are not trusted by the web command routes.

## Referral Capture

1. `?ref=CODE` is captured in local storage and a short-lived cookie before login.
2. After login, `/account` or `/ambassador` can submit the pending code.
3. The backend applies the first valid attribution only.
4. Existing attribution is not replaced except by the admin override flow.

Invalid, disabled, duplicate, and self-referral attempts are rejected.

## Wallet and Polymarket Readiness

Wallet connection is separate from auth. External Polymarket routing remains user-owned and user-signed. The app does not custody Polymarket funds and does not place trades for users.

`POLYMARKET_ROUTED_TRADING_ENABLED` remains disabled by default.

## Launch Note

Hong Kong launch requires legal review before enabling production trading or public reward claims.
