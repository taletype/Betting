import type { AppLocale } from "./locale";

type LocalizableMarket = {
  title?: string | null;
  titleOriginal?: string | null;
  titleLocalized?: string | null;
  locale?: string | null;
  category?: string | null;
};

const entityZh: Record<string, string> = {
  Morocco: "摩洛哥",
  Norway: "挪威",
  Senegal: "塞內加爾",
  Argentina: "阿根廷",
  Brazil: "巴西",
  France: "法國",
  Germany: "德國",
  England: "英格蘭",
  Spain: "西班牙",
  Portugal: "葡萄牙",
  Netherlands: "荷蘭",
  "United States": "美國",
};

const eventZh: Record<string, string> = {
  "FIFA World Cup": "FIFA 世界盃",
};

const outcomeZh: Record<string, string> = {
  Yes: "是",
  YES: "是",
  No: "否",
  NO: "否",
  Up: "上升",
  Down: "下跌",
  Over: "高於",
  Under: "低於",
};

const categoryZh: Record<string, string> = {
  sports: "體育",
  politics: "政治",
  crypto: "加密貨幣",
  culture: "文化",
  business: "商業",
  economy: "經濟",
};

const isZhLocale = (locale: AppLocale | string | undefined): boolean =>
  locale === "zh-HK" || locale === "zh-CN";

const localizeKnownWinMarket = (title: string): string | null => {
  const match = /^Will (.+?) win the (.+?)\?$/i.exec(title.trim());
  if (!match) return null;

  const [, entity, event] = match;
  if (!entity || !event) return null;

  const eventMatch = /^(?:(\d{4})\s+)?(.+)$/.exec(event.trim());
  const year = eventMatch?.[1] ? `${eventMatch[1]} ` : "";
  const eventName = eventMatch?.[2]?.trim() ?? event.trim();
  const translatedEntity = entityZh[entity.trim()];
  const translatedEvent = eventZh[eventName];

  if (!translatedEntity || !translatedEvent) return null;
  return `${translatedEntity}會否贏得 ${year}${translatedEvent}？`;
};

export const getOriginalMarketTitle = (market: LocalizableMarket): string =>
  market.titleOriginal?.trim() || market.title?.trim() || "";

export const localizeMarketTitle = (market: LocalizableMarket, locale: AppLocale | string): string => {
  const original = getOriginalMarketTitle(market);
  if (!isZhLocale(locale)) return original || market.titleLocalized?.trim() || market.title?.trim() || "";

  const safeRuleBased = original ? localizeKnownWinMarket(original) : null;
  if (safeRuleBased) return safeRuleBased;

  const localized = market.titleLocalized?.trim();
  if (localized && market.locale === locale) return localized;

  return original || localized || market.title?.trim() || "";
};

export const localizeOutcomeLabel = (label: string | null | undefined, locale: AppLocale | string): string => {
  const trimmed = label?.trim();
  if (!trimmed) return "";
  if (!isZhLocale(locale)) return trimmed;
  return outcomeZh[trimmed] ?? trimmed;
};

export const localizeMarketCategory = (category: string | null | undefined, locale: AppLocale | string): string => {
  const trimmed = category?.trim();
  if (!trimmed) return "";
  if (!isZhLocale(locale)) return trimmed;
  return categoryZh[trimmed.toLowerCase()] ?? trimmed;
};
