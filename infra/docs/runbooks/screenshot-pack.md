# Runbook: Screenshot pack (demo/review artifact set)

Canonical artifact location:

- `infra/artifacts/screenshot-pack/<UTC timestamp>/`
- `infra/artifacts/screenshot-pack/latest/` (latest copy)

## Purpose
Generate a repeatable visual pack for internal review/launch confidence from seeded data.

Screens captured:
- markets list
- active market detail
- resolved market detail
- portfolio
- claims
- admin
- external-markets

## Prerequisites
1. Start local stack and seed dense data:

```bash
supabase start
pnpm db:reset
```

2. Run API and web apps:

```bash
pnpm dev:api
pnpm dev:web
```

3. Export web->API proxy env so authenticated/admin pages render coherently in screenshots:

```bash
export API_BASE_URL="http://127.0.0.1:4000"
export API_REQUEST_USER_ID="00000000-0000-4000-8000-000000000002"
export API_REQUEST_ADMIN_TOKEN="$ADMIN_API_TOKEN"
```

> `API_REQUEST_ADMIN_TOKEN` must match the API server `ADMIN_API_TOKEN` value.

## Generate screenshot pack

```bash
pnpm screenshots:pack
```

Optional overrides:

```bash
SCREENSHOT_BASE_URL="http://127.0.0.1:3000" \
SCREENSHOT_ACTIVE_MARKET_ID="11111111-1111-4111-8111-111111111111" \
SCREENSHOT_RESOLVED_MARKET_ID="13131313-1313-4131-8131-131313131313" \
SCREENSHOT_ARTIFACT_DIR="infra/artifacts/screenshot-pack" \
pnpm screenshots:pack
```

## Output
Each run produces:
- `markets-list.png`
- `market-active-detail.png`
- `market-resolved-detail.png`
- `portfolio.png`
- `claims.png`
- `admin.png`
- `external-markets.png`
- `README.md` (run metadata)

Then copies those files to `infra/artifacts/screenshot-pack/latest/` for quick review links.
