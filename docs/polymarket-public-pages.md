# Polymarket Public Pages

Public pages:

- `/` is the Chinese-first landing page.
- `/polymarket` is the primary Polymarket market feed.
- `/polymarket/[slug]` is the market detail page.
- `/external-markets` remains a compatibility redirect to `/polymarket`.

Market data rules:

- Do not scrape Polymarket.
- Use official/public Polymarket APIs through the sync worker, or existing external market tables already populated from approved sources.
- Missing `POLY_BUILDER_CODE` must not break browsing.
- Market browsing is read-only and available without login.

Trading boundary:

- `POLYMARKET_ROUTED_TRADING_ENABLED=false` by default.
- Live routed trading must stay disabled unless user-owned signing, L2 credentials, and submitter flow are production-safe.
- Users sign their own orders. The platform does not custody Polymarket funds and does not place trades for users.
- External Polymarket activity must not mutate internal trading ledgers or balances.

Builder disclosure:

- Pending Maker Builder fee disclosure: 0.5%.
- Pending Taker Builder fee disclosure: 1%.
- Disclosure values are not authoritative settlement values; settlement must come from confirmed Polymarket Builder revenue.
