# Site i18n

Supported locales are `zh-HK` (default Traditional Chinese), `zh-CN`, and `en`. Legacy `zh-TW` route/cookie/header values normalize to `zh-HK`.

Public routes work with or without a locale prefix:

- `/`, `/polymarket`, `/polymarket/[slug]`, `/ambassador`, `/rewards`, `/guides`
- `/zh-hk`, `/zh-cn`, `/en`
- `/[locale]/polymarket`, `/[locale]/polymarket/[slug]`, `/[locale]/ambassador`, `/[locale]/rewards`, `/[locale]/guides`

Unprefixed routes resolve locale from the `bet_locale` cookie, then `Accept-Language`, then `zh-HK`. Language switching preserves the current route and query string, including `?ref=CODE`, and stores the selected locale in a cookie and localStorage. Referral capture remains first-valid-wins and is independent of locale.

Language only changes presentation. It does not bypass trading, jurisdiction, geoblock, credential, user-signing, or payout controls.
