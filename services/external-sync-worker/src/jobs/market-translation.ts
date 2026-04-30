import { createHash } from "node:crypto";

import { createDatabaseClient, type DatabaseExecutor } from "@bet/db";

const provider = "groq";
const supportedLocales = ["zh-HK", "zh-TW", "zh-CN"] as const;
type TranslationLocale = (typeof supportedLocales)[number];
type TranslationStatus = "pending" | "translated" | "reviewed" | "failed" | "stale" | "skipped";

interface CachedMarketRow {
  source: "polymarket";
  external_id: string;
  title: string;
  description: string | null;
  outcomes: unknown;
  last_synced_at: Date | string | null;
}

interface TranslationRow {
  source: string;
  external_id: string;
  locale: string;
  source_content_hash: string;
  status: TranslationStatus;
}

interface TranslationPayload {
  title: string;
  description: string;
  outcomes: string[];
}

export interface MarketTranslationSyncSummary {
  ok: boolean;
  provider: typeof provider;
  model: string;
  enabled: boolean;
  locales: TranslationLocale[];
  scanned: number;
  translated: number;
  skipped: number;
  failed: number;
  stale: number;
}

export interface MarketTranslator {
  translate(input: {
    title: string;
    description: string;
    outcomes: string[];
    locale: TranslationLocale;
  }): Promise<TranslationPayload>;
}

const defaultModel = "qwen/qwen3-32b";

const readBoolean = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1";
};

const readPositiveInteger = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getConfiguredLocales = (): TranslationLocale[] => {
  const configured = (process.env.MARKET_TRANSLATION_LOCALES ?? "zh-HK,zh-TW,zh-CN")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const locales = configured.filter((value): value is TranslationLocale =>
    supportedLocales.includes(value as TranslationLocale),
  );
  return locales.length > 0 ? [...new Set(locales)] : ["zh-HK"];
};

const normalizeOutcomes = (outcomes: unknown): string[] => {
  if (!Array.isArray(outcomes)) return [];
  return outcomes.map((outcome, index) => {
    const record = outcome && typeof outcome === "object" ? outcome as Record<string, unknown> : {};
    return typeof record.title === "string" && record.title.trim() ? record.title : `Outcome ${index + 1}`;
  });
};

export const getMarketSourceContentHash = (input: { title: string; description: string; outcomes: string[] }): string =>
  createHash("sha256")
    .update(JSON.stringify({
      title: input.title,
      description: input.description,
      outcomes: input.outcomes,
    }))
    .digest("hex");

const localeInstruction = (locale: TranslationLocale): string => {
  if (locale === "zh-HK") return "Use Hong Kong Traditional Chinese.";
  if (locale === "zh-TW") return "Use Taiwan Traditional Chinese.";
  return "Use Simplified Chinese.";
};

const safeParseTranslationJson = (value: string, expectedOutcomes: number): TranslationPayload => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("MALFORMED_JSON_OBJECT");
  const record = parsed as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.description !== "string" || !Array.isArray(record.outcomes)) {
    throw new Error("MALFORMED_JSON_SHAPE");
  }
  if (record.outcomes.length !== expectedOutcomes || record.outcomes.some((outcome) => typeof outcome !== "string")) {
    throw new Error("MALFORMED_OUTCOMES");
  }
  return {
    title: record.title,
    description: record.description,
    outcomes: record.outcomes as string[],
  };
};

export const createGroqMarketTranslator = (apiKey: string, model = defaultModel): MarketTranslator => ({
  async translate(input) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Translate Polymarket market text. Return strict JSON only with keys title, description, outcomes.",
              localeInstruction(input.locale),
              "Preserve names, tickers, dates, numbers, odds, token symbols, and market conditions.",
              "Preserve these terms exactly: Polymarket, Builder Code, pUSD, USDC, CLOB.",
              "Do not add claims not present in source.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.title,
              description: input.description,
              outcomes: input.outcomes,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`GROQ_HTTP_${response.status}`);
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("GROQ_EMPTY_RESPONSE");
    return safeParseTranslationJson(content, input.outcomes.length);
  },
});

const upsertStatus = async (
  db: DatabaseExecutor,
  row: CachedMarketRow,
  locale: TranslationLocale,
  hash: string,
  values: {
    status: TranslationStatus;
    title?: string | null;
    description?: string | null;
    outcomes?: string[] | null;
    model: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> => {
  await db.query(
    `
      insert into public.external_market_translations (
        source, external_id, locale, title_translated, description_translated,
        outcomes_translated, status, provider, model, source_content_hash,
        error_code, error_message, translated_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, now())
      on conflict (source, external_id, locale) do update set
        title_translated = excluded.title_translated,
        description_translated = excluded.description_translated,
        outcomes_translated = excluded.outcomes_translated,
        status = excluded.status,
        provider = excluded.provider,
        model = excluded.model,
        source_content_hash = excluded.source_content_hash,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        translated_at = excluded.translated_at,
        updated_at = now()
    `,
    [
      row.source,
      row.external_id,
      locale,
      values.title ?? null,
      values.description ?? null,
      JSON.stringify(values.outcomes ?? null),
      values.status,
      provider,
      values.model,
      hash,
      values.errorCode ?? null,
      values.errorMessage?.slice(0, 500) ?? null,
      values.status === "translated" ? new Date().toISOString() : null,
    ],
  );
};

export const runPolymarketMarketTranslationSyncJobWithDependencies = async (
  db: DatabaseExecutor,
  translator?: MarketTranslator,
): Promise<MarketTranslationSyncSummary> => {
  const enabled = readBoolean("MARKET_TRANSLATION_ENABLED", true);
  const model = process.env.GROQ_TRANSLATION_MODEL?.trim() || defaultModel;
  const locales = getConfiguredLocales();
  const summary: MarketTranslationSyncSummary = {
    ok: true,
    provider,
    model,
    enabled,
    locales,
    scanned: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
    stale: 0,
  };

  if (!enabled) return { ...summary, ok: true };

  const apiKey = process.env.GROQ_API_KEY?.trim();
  const activeTranslator = translator ?? (apiKey ? createGroqMarketTranslator(apiKey, model) : null);
  const batchSize = readPositiveInteger("MARKET_TRANSLATION_BATCH_SIZE", 25);
  const markets = await db.query<CachedMarketRow>(
    `
      select source, external_id, title, description, outcomes, last_synced_at
      from public.external_market_cache
      where source = 'polymarket'
      order by last_synced_at desc nulls last, external_id asc
      limit $1
    `,
    [batchSize],
  );
  summary.scanned = markets.length;

  for (const market of markets) {
    const outcomes = normalizeOutcomes(market.outcomes);
    const description = market.description ?? "";
    const hash = getMarketSourceContentHash({ title: market.title, description, outcomes });
    const existing = await db.query<TranslationRow>(
      `
        select source, external_id, locale, source_content_hash, status
        from public.external_market_translations
        where source = $1 and external_id = $2 and locale = any($3::text[])
      `,
      [market.source, market.external_id, locales],
    );
    const byLocale = new Map(existing.map((row) => [row.locale, row]));

    for (const locale of locales) {
      const current = byLocale.get(locale);
      if (current?.source_content_hash === hash && ["translated", "reviewed", "skipped"].includes(current.status)) {
        summary.skipped += 1;
        continue;
      }

      if (current && current.source_content_hash !== hash) {
        summary.stale += 1;
      }

      if (!activeTranslator) {
        await upsertStatus(db, market, locale, hash, {
          status: "skipped",
          model,
          errorCode: "GROQ_API_KEY_MISSING",
          errorMessage: "Groq translation skipped because GROQ_API_KEY is not configured.",
        });
        summary.skipped += 1;
        continue;
      }

      try {
        const translated = await activeTranslator.translate({ title: market.title, description, outcomes, locale });
        await upsertStatus(db, market, locale, hash, {
          status: "translated",
          title: translated.title,
          description: translated.description,
          outcomes: translated.outcomes,
          model,
        });
        summary.translated += 1;
      } catch (error) {
        await upsertStatus(db, market, locale, hash, {
          status: "failed",
          model,
          errorCode: error instanceof Error ? error.message.slice(0, 80) : "TRANSLATION_FAILED",
          errorMessage: "Market translation failed. Full source prompt is intentionally not logged.",
        });
        summary.failed += 1;
      }
    }
  }

  return summary;
};

export const polymarket_market_translation_sync = async (): Promise<MarketTranslationSyncSummary> =>
  runPolymarketMarketTranslationSyncJobWithDependencies(createDatabaseClient());

