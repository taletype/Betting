import { createHash } from "node:crypto";

import type { PublicExternalMarketRecord } from "./polymarket-gamma-fallback";

export const marketTranslationLocales = ["zh-HK", "zh-TW", "zh-CN"] as const;
export type MarketTranslationLocale = (typeof marketTranslationLocales)[number];
export type MarketResponseLocale = MarketTranslationLocale | "en";
export type MarketTranslationStatus = "pending" | "translated" | "reviewed" | "failed" | "stale" | "skipped" | "original";

type SupabaseLike = {
  from: (table: string) => unknown;
};

interface TranslationRow {
  source: string;
  external_id: string;
  locale: MarketTranslationLocale;
  title_translated: string | null;
  description_translated: string | null;
  outcomes_translated: unknown;
  status: MarketTranslationStatus;
  source_content_hash: string;
  translated_at: string | null;
  updated_at: string | null;
}

export const resolveMarketLocale = (value: string | null | undefined): MarketResponseLocale => {
  if (value === "en" || marketTranslationLocales.includes(value as MarketTranslationLocale)) {
    return value as MarketResponseLocale;
  }
  return "zh-HK";
};

export const getConfiguredMarketTranslationLocales = (): MarketTranslationLocale[] => {
  const configured = (process.env.MARKET_TRANSLATION_LOCALES ?? "zh-HK,zh-TW,zh-CN")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const locales = configured.filter((value): value is MarketTranslationLocale =>
    marketTranslationLocales.includes(value as MarketTranslationLocale),
  );
  return locales.length > 0 ? [...new Set(locales)] : ["zh-HK"];
};

export const getMarketTranslationConfig = () => ({
  enabled: (process.env.MARKET_TRANSLATION_ENABLED ?? "true").toLowerCase() === "true",
  provider: "groq",
  model: process.env.GROQ_TRANSLATION_MODEL?.trim() || "qwen/qwen3-32b",
  defaultLocale: resolveMarketLocale(process.env.MARKET_TRANSLATION_DEFAULT_LOCALE ?? "zh-HK"),
  locales: getConfiguredMarketTranslationLocales(),
});

const stableOutcomes = (market: PublicExternalMarketRecord): string[] =>
  market.outcomes.map((outcome) => outcome.title);

export const getMarketSourceContentHash = (market: Pick<PublicExternalMarketRecord, "title" | "description" | "outcomes">): string =>
  createHash("sha256")
    .update(JSON.stringify({
      title: market.title,
      description: market.description,
      outcomes: stableOutcomes(market as PublicExternalMarketRecord),
    }))
    .digest("hex");

const translatedOutcomeTitles = (value: unknown, expectedLength: number): string[] | null => {
  if (!Array.isArray(value) || value.length !== expectedLength) return null;
  if (value.some((item) => typeof item !== "string")) return null;
  return value as string[];
};

const isUsable = (row: TranslationRow | undefined, hash: string): row is TranslationRow =>
  Boolean(row && ["translated", "reviewed"].includes(row.status) && row.source_content_hash === hash);

const rowStatus = (row: TranslationRow | undefined): MarketTranslationStatus | undefined => row?.status;

const statusFor = (requested: MarketResponseLocale, requestedRow: TranslationRow | undefined, defaultRow: TranslationRow | undefined, hash: string): MarketTranslationStatus => {
  if (requested === "en") return "original";
  if (requestedRow && requestedRow.source_content_hash !== hash) return "stale";
  if (isUsable(requestedRow, hash)) return requestedRow.status;
  if (defaultRow && defaultRow.source_content_hash !== hash) return "stale";
  if (isUsable(defaultRow, hash)) return defaultRow.status;
  return rowStatus(requestedRow) ?? rowStatus(defaultRow) ?? "pending";
};

const localizeMarket = (
  market: PublicExternalMarketRecord,
  requestedLocale: MarketResponseLocale,
  rows: TranslationRow[],
): PublicExternalMarketRecord => {
  const titleOriginal = market.title;
  const descriptionOriginal = market.description;
  const outcomesOriginal = market.outcomes.map((outcome) => ({ ...outcome }));
  const hash = getMarketSourceContentHash(market);
  const requestedRow = rows.find((row) => row.locale === requestedLocale);
  const defaultRow = rows.find((row) => row.locale === "zh-HK");
  const row = requestedLocale === "en" ? undefined : isUsable(requestedRow, hash) ? requestedRow : isUsable(defaultRow, hash) ? defaultRow : undefined;
  const localizedOutcomeTitles = row ? translatedOutcomeTitles(row.outcomes_translated, market.outcomes.length) : null;
  const outcomesLocalized = localizedOutcomeTitles
    ? market.outcomes.map((outcome, index) => ({ ...outcome, title: localizedOutcomeTitles[index] ?? outcome.title }))
    : outcomesOriginal;
  const translationStatus = statusFor(requestedLocale, requestedRow, defaultRow, hash);
  const effectiveLocale: MarketResponseLocale = requestedLocale === "en" ? "en" : row?.locale ?? "en";

  return {
    ...market,
    title: row?.title_translated || titleOriginal,
    question: row?.title_translated || market.question || titleOriginal,
    description: row?.description_translated || descriptionOriginal,
    outcomes: outcomesLocalized,
    titleOriginal,
    titleLocalized: row?.title_translated || titleOriginal,
    descriptionOriginal,
    descriptionLocalized: row?.description_translated || descriptionOriginal,
    outcomesOriginal,
    outcomesLocalized,
    locale: effectiveLocale,
    translationStatus,
  };
};

export async function applyMarketTranslations(
  supabase: SupabaseLike,
  markets: PublicExternalMarketRecord[],
  requestedLocale: MarketResponseLocale,
): Promise<PublicExternalMarketRecord[]> {
  if (markets.length === 0 || requestedLocale === "en") {
    return markets.map((market) => localizeMarket(market, "en", []));
  }

  const ids = markets.map((market) => market.externalId);
  const locales = [...new Set([requestedLocale, "zh-HK"].filter((locale) => locale !== "en"))];
  let data: TranslationRow[] | null = null;
  try {
    const result = await (supabase.from("external_market_translations") as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            in: (column: string, values: string[]) => Promise<{ data: TranslationRow[] | null; error: Error | null }>;
          };
        };
      };
    })
      .select("source, external_id, locale, title_translated, description_translated, outcomes_translated, status, source_content_hash, translated_at, updated_at")
      .eq("source", "polymarket")
      .in("external_id", ids)
      .in("locale", locales);
    if (result.error) {
      return markets.map((market) => localizeMarket(market, requestedLocale, []));
    }
    data = result.data;
  } catch {
    return markets.map((market) => localizeMarket(market, requestedLocale, []));
  }

  const byMarket = new Map<string, TranslationRow[]>();
  for (const row of data ?? []) {
    const list = byMarket.get(row.external_id) ?? [];
    list.push(row);
    byMarket.set(row.external_id, list);
  }

  return markets.map((market) => localizeMarket(market, requestedLocale, byMarket.get(market.externalId) ?? []));
}
