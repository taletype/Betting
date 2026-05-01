# Production Smoke Checks

Use production only as a visual and public-route smoke target. Do not depend on production for unit tests, and do not require magic-link inbox access.

Default target:

```sh
SMOKE_BASE_URL=https://betting-web-ten.vercel.app pnpm exec tsx infra/scripts/smoke-polymarket-ui.ts
```

## URLs

- `/`
- `/polymarket`
- `/polymarket?view=all`
- `/polymarket?status=all&view=all`
- `/login?next=/polymarket`
- `/login?next=/polymarket&ref=TESTCODE`

## Checks

- Page returns 200.
- No localhost URL appears in production HTML.
- No raw service-role env names appear in HTML.
- No primary `前往 Polymarket` or `Open on Polymarket` CTA.
- Smart Feed and All Markets controls are visible.
- Market cards are visible when production has synced rows.
- Login form is visible.
- Magic-link button is enabled when Supabase public env is configured, otherwise auth unavailable copy is visible.
- Mobile layout remains usable.
- No obvious hydration or image-domain failures in browser console when manual browser testing is available.

Playwright was not available in this workspace during the hardening pass, so screenshots were not automated here.
