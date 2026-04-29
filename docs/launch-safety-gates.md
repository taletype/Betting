# Launch Safety Gates

This checklist is the go/no-go gate for inviting real users into the Polymarket Builder acquisition funnel.

## Go/No-Go Checklist

- [ ] Rotate and revoke any Polymarket API credential that was ever exposed outside the intended secret store.
- [ ] Confirm no Polymarket API secret, passphrase, private key, user credential, or full auth header is committed.
- [ ] Public market browsing works without login and without `POLY_BUILDER_CODE`.
- [ ] Polymarket data uses existing external market tables and official/public Polymarket APIs only. No scraping.
- [ ] `POLYMARKET_ROUTED_TRADING_ENABLED=false` unless user-owned signing, L2 credentials, and submitter wiring have passed production review.
- [ ] No platform-owned credential can place a user trade.
- [ ] Routed trading attaches `POLY_BUILDER_CODE` only immediately before a real user-signed submission.
- [ ] External Polymarket routes do not import or mutate internal ledger, balance, matching, deposit, withdrawal, or portfolio modules.
- [ ] Internet-facing command routes reject spoofed `x-user-id` impersonation in production.
- [ ] Internet-facing command routes use verified Supabase Auth identity and ignore `x-user-id`, `x-admin`, `x-role`, body `userId`, and query `userId`.
- [ ] Admin routes require verified Supabase admin authorization (`app_metadata.role = "admin"`).
- [ ] Referral attribution is first-valid-code-wins, rejects self-referral when identity is known, and rejects disabled codes.
- [ ] Rewards are direct-referral accounting records only.
- [ ] No recursive, multi-level, second-level, tree, matrix, or ancestry payout logic exists.
- [ ] Reward entries remain pending until Builder-fee revenue is confirmed.
- [ ] Payable rewards still require confirmation rules.
- [ ] Payouts require manual admin approval and are not sent automatically.
- [ ] Hong Kong zh-HK user-facing copy avoids prohibited income-guarantee or multi-level reward wording.

## Required Verification Commands

```bash
pnpm typecheck
pnpm test
pnpm --filter @bet/web build
pnpm --filter @bet/web test
pnpm --filter @bet/service-api test
pnpm --filter @bet/integrations test
pnpm --filter @bet/contracts test
```

## Secret Scan Guard

Run this grep before launch and after every deployment configuration change:

```bash
rg -n "POLYMARKET_(API_SECRET|API_KEY|API_PASSPHRASE|CLOB_SECRET|CLOB_API_KEY|CLOB_PASSPHRASE)\\s*=|PRIVATE_KEY\\s*=" --glob '!pnpm-lock.yaml' --glob '!**/node_modules/**' .
```

Expected result: no real credential assignments. Placeholders in private deployment secret stores are acceptable; committed secrets are not.

## Current Default

Live Polymarket routed trading is disabled by default. Market browsing, referral capture, and reward accounting review can be launched independently of live order submission.

## Auth Gate

Before launch, verify the architecture in `docs/supabase-auth.md` and the RLS posture in `docs/auth-rls-checklist.md`.

Command, write, admin, money, and trading routes must reject unauthenticated requests with `401` and authenticated non-admin admin requests with `403`. Service-role credentials may run server-side jobs and reads but must never become the browser user's identity.
