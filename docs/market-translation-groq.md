# Groq Market Translation

Market content localization is server-side only. Browser code must never call Groq and must never receive `GROQ_API_KEY`. Do not add `NEXT_PUBLIC_GROQ_API_KEY`.

Environment:

- `GROQ_API_KEY`
- `GROQ_TRANSLATION_MODEL=qwen/qwen3-32b`
- `MARKET_TRANSLATION_ENABLED=true`
- `MARKET_TRANSLATION_DEFAULT_LOCALE=zh-HK`
- `MARKET_TRANSLATION_LOCALES=zh-HK,zh-CN`
- `MARKET_TRANSLATION_BATCH_SIZE=25`

The worker export is `polymarket_market_translation_sync`. It reads cached Polymarket rows, computes a source content hash from the original English title, description, and outcomes, and writes translated sidecar rows to `external_market_translations`. Original Polymarket source text is never overwritten.

API locale fallback:

1. requested locale translation
2. `zh-HK` translation
3. original English source

Supported API examples:

- `/api/external/markets?locale=zh-HK`
- `/api/external/markets?locale=zh-CN`
- `/api/external/markets?locale=en`

Legacy `locale=zh-TW` requests normalize to `zh-HK`.

If `GROQ_API_KEY` is missing, translation sync marks rows skipped and public browsing continues.

Language support does not enable live trading, bypass jurisdiction controls, create automatic payouts, or mutate balances.
