# Admin Security

Admin access is based on authenticated Supabase user identity and app metadata roles. Spoofable request headers such as `x-admin`, `x-user`, `x-user-id`, and role headers are not authorization sources.

Required controls:
- Admin API routes require a verified authenticated user with an admin role or the route-specific finance/trading permission.
- Non-admin users receive `403`; unauthenticated users receive `401`.
- CSV exports require admin authorization.
- Payout approve, paid, failed, and cancelled actions require admin authorization.
- Payout paid actions require the payout to be approved first and require a valid Polygon transaction hash for wallet payouts.
- Service-role clients and `SUPABASE_SERVICE_ROLE_KEY` are server-side only.
- Frontend source, rendered HTML, and build output must not expose service-role keys, L2 credentials, private keys, full auth headers, or raw bearer tokens.

Audit requirements:
- Every admin action writes `admin_audit_log`.
- Audit rows include actor admin user id, action, target type/id, timestamp, metadata, and notes where applicable.
- Payout state changes include before and after status.
- Risk-flag review and dismiss actions include `open -> reviewed` or `open -> dismissed`.
- Admin pages should display safe summaries only; raw secret-bearing metadata is not rendered.

Payout security:
- `requested -> approved` reserves manual review only and never sends funds.
- `approved -> paid` records manual payment completion and transaction hash.
- `approved -> failed` and `approved -> cancelled` release reserved rewards.
- Duplicate open payout requests are blocked.
- Open high-severity risk flags block payout approval until reviewed.

Operator rules:
- Do not deploy with `AMBASSADOR_AUTO_PAYOUT_ENABLED=true`.
- Do not add wallet transfer, `sendTransaction`, or `sendRawTransaction` paths to reward payout code.
- Do not expose Supabase service-role keys to the browser.
- Do not use platform-owned Polymarket credentials to trade for users.
