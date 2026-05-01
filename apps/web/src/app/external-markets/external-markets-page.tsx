import React from "react";
import Link from "next/link";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { getCurrentWebUser } from "../auth-session";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { MarketSparkline, MiniMetricTrend, shouldRenderSparkline, type TimeSeriesPoint } from "../charts/market-charts";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";
import { TrackedCopyButton } from "../tracked-copy-button";
import { ThirdwebWalletFundingCard } from "../thirdweb-wallet-funding-card";
import { BetaLaunchDisclosure, SharedRewardDisclosure, SharedSafetyDisclosure } from "../product-ui";

import {
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadinessInput,
  type PolymarketRoutingReadiness,
} from "./polymarket-routing-readiness";
import {
  ExternalMarketsLoadError,
  getPublicExternalMarketsReadiness,
  listExternalMarketsWithMetadata,
  type ExternalMarketApiRecord,
  type ExternalMarketStatusQuery,
  type ExternalMarketsLoadErrorCode,
} from "../../lib/api";
import {
  hasExternalMarketActivity,
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "../../lib/external-market-status";
import { formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../lib/locale";
import { getOriginalMarketTitle, localizeMarketTitle, localizeOutcomeLabel } from "../../lib/market-localization";
import { siteCopy } from "../../lib/i18n";
import { normalizeReferralCode } from "../../lib/referral-capture";
import { getSiteUrl } from "../../lib/site-url";

const toDisplay = (value: number | null, locale: AppLocale): string =>
  value === null ? "—" : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toCompactDisplay = (value: number | null, locale: AppLocale): string =>
  value === null ? "—" : value.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 });

const toPriceDisplay = (value: number | null, locale: AppLocale): string =>
  value === null || value <= 0 ? (locale === "en" ? "No price" : locale === "zh-CN" ? "暂无价格" : "暫無價格") : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const feedCopy: Record<AppLocale, {
  betaAria: string;
  beta: string;
  nonCustodial: string;
  tradingDisabled: string;
  manualApproval: string;
  activeMarkets: string;
  updated: string;
  volume24h: string;
  liquidity: string;
  referralPrefix: string;
  inviteFriends: string;
  copyInvite: string;
  copied: string;
  betaProduct: string;
  safetyReminder: string;
  officialSiteOnly: string;
  rewardNote: string;
  eligibleRewards: string;
  controlsAria: string;
  search: string;
  searchPlaceholder: string;
  filter: string;
  sort: string;
  apply: string;
  refresh: string;
  categoriesAria: string;
  sortAria: string;
  statuses: Array<[string, string]>;
  sorts: Array<[string, string]>;
  staleWarning: string;
  loadFailedTitle: string;
  refreshMarkets: string;
  emptyTitle: string;
  emptyActiveSr: string;
  viewAllMarkets: string;
  tableAria: string;
  tableHeaders: string[];
  staleData: string;
  noTradeData: string;
  sourcePolymarket: string;
  sourceApi: string;
  lastUpdated: string;
  marketDetails: string;
  updatedAt: string;
  priceTrend: string;
  copyMarketReferralLink: string;
  supportAria: string;
  builderSafetyTitle: string;
  builderSafetyBody: string;
  dataStatusTitle: string;
  dataUrl: string;
  tradingStatus: string;
  builderCodeSet: string;
  builderCodeMissing: string;
  yes: string;
  no: string;
  enabled: string;
}> = {
  en: {
    betaAria: "Polymarket beta status",
    beta: "Beta",
    nonCustodial: "Non-custodial",
    tradingDisabled: "Trading not enabled",
    manualApproval: "Manual approval",
    activeMarkets: "Active markets",
    updated: "Updated",
    volume24h: "24h volume",
    liquidity: "Liquidity",
    referralPrefix: "You are using referral code: ",
    inviteFriends: "Invite friends",
    copyInvite: "Copy general invite link",
    copied: "Copied",
    betaProduct: "Beta product",
    safetyReminder: "Safety reminder",
    officialSiteOnly: "Use only official websites and signed orders",
    rewardNote: "Reward note",
    eligibleRewards: "Eligible trades can earn rewards",
    controlsAria: "Polymarket market controls",
    search: "Search",
    searchPlaceholder: "Search markets, slug, or external ID",
    filter: "Filter",
    sort: "Sort",
    apply: "Apply",
    refresh: "Refresh",
    categoriesAria: "Polymarket categories",
    sortAria: "Polymarket sort",
    statuses: [["all", "All"], ["open", "Open"], ["closing", "Closing soon"], ["volume", "High volume"], ["liquidity", "High liquidity"], ["closed", "Closed"]],
    sorts: [["trending", "Trending"], ["volume", "Volume"], ["liquidity", "Liquidity"], ["latest", "Latest"], ["close", "Closing soon"]],
    staleWarning: "Market data may be stale. Please try again later.",
    loadFailedTitle: "Market data could not be refreshed",
    refreshMarkets: "Refresh markets",
    emptyTitle: "No market data right now",
    emptyActiveSr: "No active market data right now",
    viewAllMarkets: "View all markets",
    tableAria: "Polymarket markets table",
    tableHeaders: ["Status", "Market", "Outcomes / price", "Bid / Ask", "Volume", "Liquidity", "Close time", "Source / update", "Actions"],
    staleData: "Data may be stale",
    noTradeData: "No trade data",
    sourcePolymarket: "Source: Polymarket",
    sourceApi: "Data source: Polymarket API",
    lastUpdated: "Last updated: ",
    marketDetails: "Market details",
    updatedAt: "Updated at",
    priceTrend: "Price trend",
    copyMarketReferralLink: "Copy market referral link",
    supportAria: "Safety and operations information",
    builderSafetyTitle: "Builder / trading safety status",
    builderSafetyBody: "Browsing markets alone does not create Builder fees. Fees apply only to eligible and successfully matched Polymarket routed orders; live order submission is disabled by default.",
    dataStatusTitle: "Market data connection status",
    dataUrl: "Data URL",
    tradingStatus: "Trading status",
    builderCodeSet: "Builder Code configured",
    builderCodeMissing: "Builder Code not configured",
    yes: "yes",
    no: "no",
    enabled: "enabled",
  },
  "zh-HK": {
    betaAria: "Polymarket Beta 狀態",
    beta: "Beta",
    nonCustodial: "非託管",
    tradingDisabled: "交易尚未啟用",
    manualApproval: "人手審批",
    activeMarkets: "活躍市場",
    updated: "已更新",
    volume24h: "24 小時成交",
    liquidity: "流動性",
    referralPrefix: "你正在使用推薦碼：",
    inviteFriends: "邀請好友",
    copyInvite: "複製一般邀請連結",
    copied: "已複製",
    betaProduct: "Beta 產品",
    safetyReminder: "安全提醒",
    officialSiteOnly: "僅使用官方網站與簽名訂單",
    rewardNote: "返佣說明",
    eligibleRewards: "符合條件的交易可獲返佣",
    controlsAria: "Polymarket market controls",
    search: "搜尋",
    searchPlaceholder: "搜尋市場、slug 或外部 ID",
    filter: "篩選",
    sort: "排序",
    apply: "套用",
    refresh: "刷新",
    categoriesAria: "Polymarket 類別",
    sortAria: "Polymarket 排序",
    statuses: [["all", "全部"], ["open", "開放"], ["closing", "即將結束"], ["volume", "高成交量"], ["liquidity", "高流動性"], ["closed", "已結束"]],
    sorts: [["trending", "熱門"], ["volume", "成交量"], ["liquidity", "流動性"], ["latest", "最新"], ["close", "即將結束"]],
    staleWarning: "市場資料可能已過期，請稍後再試。",
    loadFailedTitle: "市場資料暫時未能更新",
    refreshMarkets: "重新整理市場",
    emptyTitle: "暫時未有市場資料",
    emptyActiveSr: "暫時未有活躍市場資料",
    viewAllMarkets: "查看全部市場",
    tableAria: "Polymarket 市場表格",
    tableHeaders: ["狀態", "市場", "結果 / 價格", "Bid / Ask", "成交量", "流動性", "結束時間", "來源 / 更新", "操作"],
    staleData: "資料可能過期",
    noTradeData: "暫無成交資料",
    sourcePolymarket: "來源：Polymarket",
    sourceApi: "資料來源：Polymarket API",
    lastUpdated: "最後更新：",
    marketDetails: "市場詳情",
    updatedAt: "更新時間",
    priceTrend: "價格走勢",
    copyMarketReferralLink: "複製市場推薦連結",
    supportAria: "安全及營運資訊",
    builderSafetyTitle: "Builder / 交易安全狀態",
    builderSafetyBody: "單純瀏覽市場不會產生 Builder 費用。只適用於合資格並成功成交的 Polymarket 路由訂單；實際訂單提交預設停用。",
    dataStatusTitle: "市場資料連線狀態",
    dataUrl: "資料 URL",
    tradingStatus: "交易狀態",
    builderCodeSet: "Builder Code 已設定",
    builderCodeMissing: "Builder Code 未設定",
    yes: "yes",
    no: "no",
    enabled: "enabled",
  },
  "zh-CN": {
    betaAria: "Polymarket Beta 状态",
    beta: "Beta",
    nonCustodial: "非托管",
    tradingDisabled: "交易尚未启用",
    manualApproval: "人工审核",
    activeMarkets: "活跃市场",
    updated: "已更新",
    volume24h: "24 小时成交",
    liquidity: "流动性",
    referralPrefix: "你正在使用推荐码：",
    inviteFriends: "邀请好友",
    copyInvite: "复制一般邀请链接",
    copied: "已复制",
    betaProduct: "Beta 产品",
    safetyReminder: "安全提醒",
    officialSiteOnly: "仅使用官方网站与签名订单",
    rewardNote: "返佣说明",
    eligibleRewards: "符合条件的交易可获返佣",
    controlsAria: "Polymarket market controls",
    search: "搜索",
    searchPlaceholder: "搜索市场、slug 或外部 ID",
    filter: "筛选",
    sort: "排序",
    apply: "应用",
    refresh: "刷新",
    categoriesAria: "Polymarket 类别",
    sortAria: "Polymarket 排序",
    statuses: [["all", "全部"], ["open", "开放"], ["closing", "即将结束"], ["volume", "高成交量"], ["liquidity", "高流动性"], ["closed", "已结束"]],
    sorts: [["trending", "热门"], ["volume", "成交量"], ["liquidity", "流动性"], ["latest", "最新"], ["close", "即将结束"]],
    staleWarning: "市场数据可能已过期，请稍后再试。",
    loadFailedTitle: "市场数据暂时未能更新",
    refreshMarkets: "重新整理市场",
    emptyTitle: "暂时没有市场数据",
    emptyActiveSr: "暂时没有活跃市场数据",
    viewAllMarkets: "查看全部市场",
    tableAria: "Polymarket 市场表格",
    tableHeaders: ["状态", "市场", "结果 / 价格", "Bid / Ask", "成交量", "流动性", "结束时间", "来源 / 更新", "操作"],
    staleData: "数据可能过期",
    noTradeData: "暂无成交数据",
    sourcePolymarket: "来源：Polymarket",
    sourceApi: "数据来源：Polymarket API",
    lastUpdated: "最后更新：",
    marketDetails: "市场详情",
    updatedAt: "更新时间",
    priceTrend: "价格走势",
    copyMarketReferralLink: "复制市场推荐链接",
    supportAria: "安全及运营信息",
    builderSafetyTitle: "Builder / 交易安全状态",
    builderSafetyBody: "单纯浏览市场不会产生 Builder 费用。只适用于合资格并成功成交的 Polymarket 路由订单；实际订单提交默认停用。",
    dataStatusTitle: "市场数据连接状态",
    dataUrl: "数据 URL",
    tradingStatus: "交易状态",
    builderCodeSet: "Builder Code 已设置",
    builderCodeMissing: "Builder Code 未设置",
    yes: "yes",
    no: "no",
    enabled: "enabled",
  },
};

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "cancelled" || status === "resolved" || status === "closed") {
    return "warning";
  }

  return "success";
};

const closeStateLabels: Record<AppLocale, { ended: string; live: string; closing: string }> = {
  en: { ended: "Ended", live: "Live", closing: "Closing soon" },
  "zh-HK": { ended: "已結束", live: "進行中", closing: "即將結束" },
  "zh-CN": { ended: "已结束", live: "进行中", closing: "即将结束" },
};

const getCloseState = (market: ExternalMarketApiRecord, locale: AppLocale): { label: string; progress: number } => {
  const labels = closeStateLabels[locale];
  if (market.status === "closed" || market.status === "resolved" || market.status === "cancelled") {
    return { label: labels.ended, progress: 100 };
  }

  if (!market.closeTime) return { label: labels.live, progress: 42 };

  const remaining = new Date(market.closeTime).getTime() - Date.now();
  if (remaining <= 0) return { label: labels.ended, progress: 100 };
  if (remaining <= 24 * 60 * 60 * 1000) return { label: labels.closing, progress: 86 };
  return { label: labels.live, progress: 48 };
};

const toSparklinePoints = (market: ExternalMarketApiRecord): TimeSeriesPoint[] =>
  (market.priceHistory?.length
    ? market.priceHistory.slice(-50).map((point) => ({ timestamp: point.timestamp, value: point.price }))
    : market.recentTrades
      .filter((trade) => trade.price !== null)
      .slice(0, 12)
      .reverse()
      .map((trade) => ({ timestamp: trade.tradedAt, value: trade.price })));

const hasPolymarketBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch (error) {
    console.error("invalid Polymarket builder code configuration", error);
    return false;
  }
};

interface MarketFeedSearchParams {
  q?: string;
  status?: string;
  sort?: string;
  ref?: string;
  market?: string;
}

const toTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const isDefaultFeedStatus = (status: string | undefined): boolean => !status || !["all", "open", "closing", "volume", "liquidity", "closed", "resolved", "cancelled"].includes(status);

const isDefaultFeedMarket = (market: ExternalMarketApiRecord): boolean =>
  isExternalMarketOpenNow(market) &&
  hasExternalMarketActivity(market) &&
  hasExternalMarketPriceData(market) &&
  !isExternalMarketStale(market);

const isExplicitlyStaleMarket = (market: ExternalMarketApiRecord): boolean => {
  const provenance = market.sourceProvenance ?? market.provenance;
  return Boolean(provenance && typeof provenance === "object" && (provenance as Record<string, unknown>).stale === true);
};

const qualityScore = (market: ExternalMarketApiRecord): number =>
  (market.status === "open" ? 8 : 0) +
  (hasExternalMarketActivity(market) ? 4 : 0) +
  (hasExternalMarketPriceData(market) ? 2 : 0) +
  (!isExternalMarketStale(market) ? 1 : 0);

const filterAndSortMarkets = (markets: ExternalMarketApiRecord[], params?: MarketFeedSearchParams) => {
  const q = params?.q?.trim().toLowerCase() ?? "";
  const status = params?.status?.trim();
  const sort = params?.sort ?? "trending";
  const market = params?.market?.trim().toLowerCase() ?? "";
  const defaultFeed = isDefaultFeedStatus(status);
  const defaultCandidate = (item: ExternalMarketApiRecord, allowStale: boolean): boolean =>
    isExternalMarketOpenNow(item) &&
    hasExternalMarketActivity(item) &&
    hasExternalMarketPriceData(item) &&
    ((allowStale && !isExplicitlyStaleMarket(item)) || !isExternalMarketStale(item));
  const baseMatches = (item: ExternalMarketApiRecord, allowStaleDefault = false): boolean => {
    if (q && !`${item.title} ${item.titleOriginal ?? ""} ${item.titleLocalized ?? ""} ${item.description} ${item.externalId} ${item.slug}`.toLowerCase().includes(q)) {
      return false;
    }
    if (market && item.slug.toLowerCase() !== market && item.externalId.toLowerCase() !== market && item.id.toLowerCase() !== market) {
      return false;
    }
    if (defaultFeed || status === "open") {
      return defaultCandidate(item, allowStaleDefault);
    }
    if (status === "closing") {
      const closeTime = toTime(item.closeTime);
      return isExternalMarketOpenNow(item) && !isExternalMarketStale(item) && closeTime !== null && closeTime > Date.now() && closeTime <= Date.now() + 72 * 60 * 60 * 1000;
    }
    if (status === "volume") {
      return isExternalMarketOpenNow(item) && !isExternalMarketStale(item) && (item.volume24h ?? item.volumeTotal ?? 0) > 0;
    }
    if (status === "liquidity") {
      return isExternalMarketOpenNow(item) && !isExternalMarketStale(item) && (item.liquidity ?? 0) > 0;
    }
    if (status === "closed") {
      return item.status === "closed" || item.status === "resolved" || item.status === "cancelled";
    }
    return status === "all" || item.status === status;
  };
  const sortMarkets = (items: ExternalMarketApiRecord[]) =>
    items.sort((a, b) => {
      const statusDelta = (b.status === "open" ? 1 : 0) - (a.status === "open" ? 1 : 0);
      if (statusDelta !== 0) return statusDelta;
      if (sort === "volume") return (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0);
      if (sort === "liquidity") return (b.liquidity ?? b.volumeTotal ?? 0) - (a.liquidity ?? a.volumeTotal ?? 0);
      if (sort === "close") {
        const aTime = a.closeTime ? new Date(a.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.closeTime ? new Date(b.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      if (sort === "latest") return (toTime(b.createdAt) ?? 0) - (toTime(a.createdAt) ?? 0);
      const volumeDelta = (b.volume24h ?? 0) - (a.volume24h ?? 0);
      if (volumeDelta !== 0) return volumeDelta;
      const liquidityDelta = (b.liquidity ?? b.volumeTotal ?? 0) - (a.liquidity ?? a.volumeTotal ?? 0);
      if (liquidityDelta !== 0) return liquidityDelta;
      const qualityDelta = qualityScore(b) - qualityScore(a);
      if (qualityDelta !== 0) return qualityDelta;
      return (toTime(b.lastUpdatedAt ?? b.lastSyncedAt ?? b.updatedAt) ?? 0) - (toTime(a.lastUpdatedAt ?? a.lastSyncedAt ?? a.updatedAt) ?? 0);
    });

  const filtered = markets.filter((item) => baseMatches(item));
  if (filtered.length === 0 && (defaultFeed || status === "open")) {
    return sortMarkets(markets.filter((item) => baseMatches(item, true)));
  }
  return sortMarkets(filtered);
};

const buildFeedHref = (params: MarketFeedSearchParams | undefined, next: MarketFeedSearchParams): string => {
  const search = new URLSearchParams();
  const merged = { ...params, ...next };

  if (merged.q) search.set("q", merged.q);
  if (merged.status) search.set("status", merged.status);
  if (merged.sort && merged.sort !== "trending") search.set("sort", merged.sort);
  if (merged.ref) search.set("ref", merged.ref);

  const query = search.toString();
  return query ? `/polymarket?${query}` : "/polymarket";
};

const buildLocalizedFeedHref = (locale: AppLocale, params: MarketFeedSearchParams | undefined, next: MarketFeedSearchParams): string => {
  const href = buildFeedHref(params, next);
  const [pathname, query] = href.split("?");
  const localized = getLocaleHref(locale, pathname ?? "/polymarket");
  return query ? `${localized}?${query}` : localized;
};

const translationBadge = (market: ExternalMarketApiRecord, locale: AppLocale): string | null => {
  const copy = siteCopy[locale];
  if (market.translationStatus === "pending" || market.translationStatus === "failed" || market.translationStatus === "skipped") return copy.translationPending;
  if (market.translationStatus === "stale") return copy.translationStale;
  if (market.locale === "en" && locale !== "en") return copy.showingOriginal;
  return null;
};

const formatProvenance = (market: ExternalMarketApiRecord): string => {
  const provenance = market.sourceProvenance ?? market.provenance;
  if (provenance && typeof provenance === "object") {
    const record = provenance as Record<string, unknown>;
    const upstream = typeof record.upstream === "string" ? record.upstream : null;
    const endpoint = typeof record.endpoint === "string" ? record.endpoint : null;
    return [upstream, endpoint].filter(Boolean).join(" ") || market.source;
  }

  return market.source;
};

const MarketImage = ({ market, alt, priority = false }: { market: ExternalMarketApiRecord; alt: string; priority?: boolean }) => {
  void priority;
  if (!market.imageUrl) {
    return <div className="market-card-image market-card-image-fallback" aria-hidden="true" />;
  }

  return <img src={market.imageUrl} alt={alt} width={720} height={400} className="market-card-image" />;
};

const sanitizeSourceName = (source: string): string | null => {
  const trimmed = source.trim();
  if (!trimmed || /[?#@=]/.test(trimmed)) return null;
  return /^[a-z0-9._:/-]+$/i.test(trimmed) ? trimmed : null;
};

const buildDetailHref = (locale: AppLocale, market: ExternalMarketApiRecord, refCode: string | null): string => {
  const routeKey = market.slug || market.externalId;
  const search = new URLSearchParams();
  search.set("source", market.source);
  search.set("externalId", market.externalId);
  if (refCode) search.set("ref", refCode);
  return `${getLocaleHref(locale, `/polymarket/${encodeURIComponent(routeKey)}`)}?${search.toString()}`;
};

const isAllowlistedPolymarketBetaUser = (user: { id: string; email: string | null } | null): boolean => {
  if (!user) return false;
  const allowlist = (process.env.POLYMARKET_ROUTED_TRADING_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(user.id.toLowerCase()) || Boolean(user.email && allowlist.includes(user.email.toLowerCase()));
};

export async function renderExternalMarketsPage(locale: AppLocale, params?: MarketFeedSearchParams) {
  const copy = getLocaleCopy(locale).research;
  const ui = feedCopy[locale];
  let markets: ExternalMarketApiRecord[] = [];
  let loadFailed = false;
  let loadDiagnostics: ExternalMarketsLoadErrorCode[] = [];
  let failedSources: string[] = [];
  let fallbackUsed = false;
  const hasBuilderCode = hasPolymarketBuilderCode();
  const globallyRoutedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const betaRoutedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_BETA_ENABLED === "true";
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true" ? "enabled" : "disabled";
  const submitterAvailable = submitterMode === "enabled";
  const refCode = normalizeReferralCode(params?.ref);
  const currentUser = await getCurrentWebUser();
  const betaUserAllowlisted = globallyRoutedTradingEnabled || (betaRoutedTradingEnabled && isAllowlistedPolymarketBetaUser(currentUser));
  const routedTradingEnabled = globallyRoutedTradingEnabled || betaRoutedTradingEnabled;
  const publicSubmitEnabled = globallyRoutedTradingEnabled && hasBuilderCode && submitterAvailable;
  const publicTradingStatusLabel = publicSubmitEnabled
    ? (locale === "en" ? "Live submission enabled" : locale === "zh-CN" ? "实盘提交已启用" : "實盤提交已啟用")
    : routedTradingEnabled
      ? (locale === "en" ? "Trading preview enabled; live submission remains disabled" : locale === "zh-CN" ? "交易界面预览已启用；实盘提交仍然停用" : "交易介面預覽已啟用；實盤提交仍然停用")
      : (locale === "en" ? "Trading preview; live submission disabled" : locale === "zh-CN" ? "交易界面预览；实盘提交停用" : "交易介面預覽；實盤提交停用");
  const normalizedParams: MarketFeedSearchParams = { ...params, ref: refCode ?? params?.ref ?? undefined };
  const dataReadiness = getPublicExternalMarketsReadiness();
  const selectedStatus = params?.status?.trim();
  const defaultFeed = isDefaultFeedStatus(selectedStatus);
  const requestedStatus: ExternalMarketStatusQuery =
    !selectedStatus || defaultFeed
      ? "open"
      : selectedStatus === "all" || selectedStatus === "closed"
        ? "all"
        : selectedStatus === "resolved" || selectedStatus === "cancelled"
          ? selectedStatus
        : "open";

  try {
    const result = await listExternalMarketsWithMetadata(locale, requestedStatus);
    markets = result.markets.filter((market) => market.source === "polymarket");
    fallbackUsed = result.fallbackUsed || result.diagnostics?.fallbackUsedLastRequest === true;
  } catch (error) {
    loadFailed = true;
    if (error instanceof ExternalMarketsLoadError) {
      loadDiagnostics = error.diagnostics;
      failedSources = error.sources.map(sanitizeSourceName).filter((source): source is string => source !== null);
    } else {
      loadDiagnostics = ["unknown"];
    }
    console.error("failed to load external markets", error);
  }
  const visibleMarkets = filterAndSortMarkets(markets, params);
  const statusInput: PolymarketRoutingReadinessInput = {
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    betaUserAllowlisted,
    submitModeEnabled: submitterMode === "enabled",
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    geoblockStatus: "unknown",
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: visibleMarkets.some((market) => market.status === "open"),
    orderValid: true,
    submitterAvailable,
  };
  const disabledReasonLabel = (reason: PolymarketRoutingReadiness) => copy.readinessCopy[reason] ?? reason;
  const shareUrl = refCode ? `${getSiteUrl()}/polymarket?ref=${encodeURIComponent(refCode)}` : `${getSiteUrl()}/polymarket`;
  const externalMarketsEndpointReachable = !loadFailed;
  const sameOriginApiReachable = dataReadiness.sameOriginApiSelected ? !loadFailed : true;
  const serviceApiReachable = dataReadiness.serviceApiSelected ? !loadFailed : dataReadiness.configuredApiBaseIsWebOrigin ? false : dataReadiness.apiBaseUrlConfigured;
  const thirdwebClientConfigured = Boolean(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim());
  const staleMarketsPresent = markets.some(isExternalMarketStale);
  const staleOpenMarketsPresent = markets.some((market) => isExternalMarketOpenNow(market) && isExternalMarketStale(market));
  const activeMarketsCount = markets.filter(isDefaultFeedMarket).length;
  const updatedMarketsCount = markets.filter((market) => !isExternalMarketStale(market)).length;
  const totalVolume24h = visibleMarkets.reduce((sum, market) => sum + (market.volume24h ?? 0), 0);
  const totalLiquidity = visibleMarkets.reduce((sum, market) => sum + (market.liquidity ?? 0), 0);

  return (
    <main className="stack polymarket-feed-page">
      <FunnelEventTracker name="market_view" metadata={{ surface: "feed" }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero polymarket-hero">
        <div className="hero-copy">
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
          <div className="trust-badge-row" aria-label={ui.betaAria}>
            <span className="badge badge-info">{ui.beta}</span>
            <span className="badge badge-success">{ui.nonCustodial}</span>
            <span className="badge badge-warning">{ui.tradingDisabled}</span>
            <span className="badge badge-warning">{ui.manualApproval}</span>
          </div>
          <div className="market-hero-metrics" aria-label="Polymarket market feed summary">
            <div>
              <span className="metric-label">{ui.activeMarkets}</span>
              <strong>{activeMarketsCount.toLocaleString(locale)}</strong>
            </div>
            <div>
              <span className="metric-label">{ui.updated}</span>
              <strong>{updatedMarketsCount.toLocaleString(locale)}</strong>
            </div>
            <div>
              <span className="metric-label">{ui.volume24h}</span>
              <strong>{toCompactDisplay(totalVolume24h || null, locale)}</strong>
            </div>
            <div>
              <span className="metric-label">{ui.liquidity}</span>
              <strong>{toCompactDisplay(totalLiquidity || null, locale)}</strong>
            </div>
          </div>
        </div>
        <aside className="hero-status-panel stack" aria-label="Polymarket referral and launch status">
          {refCode ? <div className="banner banner-success referral-banner">{ui.referralPrefix}{refCode}</div> : <PendingReferralNotice prefix={ui.referralPrefix} />}
          <div className="share-inline">
            <span className="metric-label">{ui.inviteFriends}</span>
            <TrackedCopyButton
              value={shareUrl}
              label={ui.copyInvite}
              copiedLabel={ui.copied}
              eventName="invite_link_copied"
              metadata={refCode ? { code: refCode, surface: "polymarket_feed" } : { surface: "polymarket_feed" }}
            />
          </div>
          <div className="hero-status-list">
            <div className="kv"><span className="kv-key">{ui.betaProduct}</span><span className="kv-value">{publicTradingStatusLabel}</span></div>
            <div className="kv"><span className="kv-key">{ui.safetyReminder}</span><span className="kv-value">{ui.officialSiteOnly}</span></div>
            <div className="kv"><span className="kv-key">{ui.rewardNote}</span><span className="kv-value">{ui.eligibleRewards}</span></div>
          </div>
        </aside>
      </section>
      <section className="disclosure-rail" aria-label="Beta, safety, and reward disclosures">
        <BetaLaunchDisclosure locale={locale} />
        <SharedSafetyDisclosure locale={locale} />
        <SharedRewardDisclosure locale={locale} />
      </section>
      <section className="market-command-center stack" aria-label={ui.controlsAria}>
        <form className="filters market-feed-controls" action={getLocaleHref(locale, "/polymarket")}>
          {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}
          <label className="stack">
            {ui.search}
            <input name="q" defaultValue={params?.q ?? ""} placeholder={ui.searchPlaceholder} />
          </label>
          <label className="stack">
            {ui.filter}
            <select name="status" defaultValue={defaultFeed ? "open" : selectedStatus}>
              {ui.statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="stack">
            {ui.sort}
            <select name="sort" defaultValue={params?.sort ?? "trending"}>
              {ui.sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit">{ui.apply}</button>
          <Link className="button-link secondary" href={buildLocalizedFeedHref(locale, normalizedParams, {})}>{ui.refresh}</Link>
        </form>
        <div className="market-feed-nav">
          <nav className="chip-row" aria-label={ui.categoriesAria}>
            {ui.statuses.map(([status, label]) => (
              <Link
                key={status}
                className={`chip ${((defaultFeed ? "open" : selectedStatus) === status) ? "active" : ""}`}
                href={buildLocalizedFeedHref(locale, normalizedParams, { status })}
              >
                {label}
              </Link>
            ))}
          </nav>
          <nav className="tab-row" aria-label={ui.sortAria}>
            {ui.sorts.map(([sort, label]) => (
              <Link
                key={sort}
                className={`tab-link ${((params?.sort ?? "trending") === sort) ? "active" : ""}`}
                href={buildLocalizedFeedHref(locale, normalizedParams, { sort })}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      {staleMarketsPresent ? (
        <div className="banner banner-warning">{ui.staleWarning}</div>
      ) : null}
      <section className="stack">
        {loadFailed ? (
          <div className="panel empty-state">
            <strong>{ui.loadFailedTitle}</strong>
            <p>{copy.loadError}</p>
            {loadDiagnostics.includes("market_source_unavailable") ? (
              <>
                <p>{copy.sourceUnavailable}</p>
                <p>{copy.sourceUnavailableRetry}</p>
                {failedSources.length > 0 ? (
                  <div className="muted">{copy.failedSources}: {failedSources.join(", ")}</div>
                ) : null}
              </>
            ) : (
              loadDiagnostics.length > 0 ? (
                <ul>
                  {loadDiagnostics.map((diagnostic) => (
                    <li key={diagnostic}>{copy.loadErrorDetails[diagnostic] ?? diagnostic}</li>
                  ))}
                </ul>
              ) : null
            )}
            <Link className="button-link secondary" href={buildLocalizedFeedHref(locale, normalizedParams, {})}>{ui.refreshMarkets}</Link>
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className="panel empty-state">
            <strong>{ui.emptyTitle}</strong>
            <p>{defaultFeed && staleOpenMarketsPresent ? ui.staleWarning : ui.emptyTitle}</p>
            <span className="sr-only">{ui.emptyActiveSr}</span>
            {defaultFeed ? (
              <Link className="button-link secondary" href={buildLocalizedFeedHref(locale, normalizedParams, { status: "all" })}>{ui.viewAllMarkets}</Link>
            ) : (
              <ul>
                <li>{copy.emptyDetails.externalMarketsEmpty}</li>
                <li>{copy.emptyDetails.externalSyncNotRun}</li>
              </ul>
            )}
          </div>
        ) : (
          <>
          <div className="panel market-feed-table-wrap" aria-label={ui.tableAria}>
            <table className="table market-feed-table">
              <thead>
                <tr>
                  {ui.tableHeaders.map((label) => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleMarkets.map((market) => {
                  const detailPath = buildDetailHref(locale, market, refCode);
                  const marketTopReason = getPolymarketTopBlockingReason({
                    ...statusInput,
                    marketTradable: market.status === "open" && !isExternalMarketStale(market),
                    orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && (market.lastTradePrice ?? market.bestAsk ?? market.bestBid)),
                  });
                  const marketDisabledLabel = marketTopReason ? disabledReasonLabel(marketTopReason) : copy.submitUserSignedOrder;
                  const stale = isExternalMarketStale(market);

                  return (
                    <tr key={`${market.source}:${market.externalId}`}>
                      <td>
                        <div className="stack">
                          <span className={`badge badge-${statusTone(market.status)}`}>{copy.statuses[market.status] ?? market.status}</span>
                          {stale ? <span className="badge badge-warning">{ui.staleData}</span> : null}
                        </div>
                      </td>
                      <td>
                        <strong>{localizeMarketTitle(market, locale)}</strong>
                        <div className="muted">{getOriginalMarketTitle(market) !== localizeMarketTitle(market, locale) ? getOriginalMarketTitle(market) : market.description}</div>
                      </td>
                      <td>
                        <div className="outcome-pill-row">
                          {market.outcomes.length > 0 ? market.outcomes.slice(0, 3).map((outcome) => (
                            <span className="outcome-pill" key={outcome.externalOutcomeId}>
                              <span>{localizeOutcomeLabel(outcome.title, locale)}</span>
                              <strong>{toPriceDisplay(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid, locale)}</strong>
                            </span>
                          )) : <span className="muted">{copy.outcomesUnavailable}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="kv"><span className="kv-key">{copy.bestBid}</span><span className="kv-value">{toPriceDisplay(market.bestBid, locale)}</span></div>
                        <div className="kv"><span className="kv-key">{copy.bestAsk}</span><span className="kv-value">{toPriceDisplay(market.bestAsk, locale)}</span></div>
                      </td>
                      <td>{toDisplay(market.volume24h ?? market.volumeTotal, locale)}</td>
                      <td>{toDisplay(market.liquidity ?? market.volumeTotal, locale)}</td>
                      <td>{market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"}</td>
                      <td>
                        <div>{ui.sourcePolymarket}</div>
                        <div className="muted">{ui.sourceApi}</div>
                        <div className="muted">{ui.lastUpdated}{market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}</div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link className="button-link primary-cta" href={detailPath}>{copy.tradeViaPolymarket}</Link>
                          <span className="muted disabled-inline-reason">{marketDisabledLabel}</span>
                          <Link className="button-link secondary" href={detailPath}>{ui.marketDetails}</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="market-feed-cards stack">
          {visibleMarkets.map((market) => {
            const detailPath = buildDetailHref(locale, market, refCode);
            const marketTopReason = getPolymarketTopBlockingReason({
              ...statusInput,
              marketTradable: market.status === "open",
              orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice),
            });
            const marketDisabledLabel = marketTopReason ? disabledReasonLabel(marketTopReason) : copy.submitUserSignedOrder;
            const marketShareUrl = `${getSiteUrl()}${detailPath}`;
            const sparklinePoints = toSparklinePoints(market);
            const closeState = getCloseState(market, locale);
            const stale = isExternalMarketStale(market);
            const noTradeData = !hasExternalMarketActivity(market) || !hasExternalMarketPriceData(market);

            return (
            <div key={`${market.source}:${market.externalId}`} className="panel stack market-card">
              <MarketImage market={market} alt={localizeMarketTitle(market, locale)} />
              <div className="market-card-main">
                <div className="stack">
                  <div className="market-card-meta">
                    <div className="badge badge-neutral"><span className="source-dot" aria-hidden="true" />POLYMARKET</div>
                    <div className={`badge badge-${statusTone(market.status)}`}>{copy.statuses[market.status] ?? market.status}</div>
                    {stale ? <div className="badge badge-warning">{ui.staleData}</div> : null}
                    {noTradeData ? <div className="badge badge-warning">{ui.noTradeData}</div> : null}
                    {translationBadge(market, locale) ? <div className="badge badge-warning">{translationBadge(market, locale)}</div> : null}
                  </div>
                  <strong className="market-card-title">{localizeMarketTitle(market, locale)}</strong>
                  {getOriginalMarketTitle(market) && getOriginalMarketTitle(market) !== localizeMarketTitle(market, locale) ? (
                    <details className="original-copy">
                      <summary>{locale === "en" ? "Original" : "原文"}</summary>
                      <p className="muted">{getOriginalMarketTitle(market)}</p>
                    </details>
                  ) : null}
                  <div className="outcome-pill-row">
                    {market.outcomes.length > 0 ? (
                      market.outcomes.slice(0, 4).map((outcome) => (
                        <span className="outcome-pill" key={outcome.externalOutcomeId}>
                          <span>{localizeOutcomeLabel(outcome.title, locale)}</span>
                          <strong>{toPriceDisplay(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid, locale)}</strong>
                        </span>
                      ))
                    ) : (
                      <span className="muted">{copy.outcomesUnavailable}</span>
                    )}
                  </div>
                </div>
                <div className="market-card-stats">
                  <div className="kv"><span className="kv-key">{copy.lastTrade}</span><span className="kv-value">{toPriceDisplay(market.lastTradePrice, locale)}</span></div>
                  <div className="kv"><span className="kv-key">{copy.bestBid}</span><span className="kv-value">{toPriceDisplay(market.bestBid, locale)}</span></div>
                  <div className="kv"><span className="kv-key">{copy.bestAsk}</span><span className="kv-value">{toPriceDisplay(market.bestAsk, locale)}</span></div>
                  <MiniMetricTrend label={copy.volume24h} value={toDisplay(market.volume24h, locale)} points={sparklinePoints} />
                  <div className="kv"><span className="kv-key">{copy.liquidity}</span><span className="kv-value">{toDisplay(market.liquidity ?? market.volumeTotal, locale)}</span></div>
                  <div className="kv"><span className="kv-key">{ui.updatedAt}</span><span className="kv-value">{market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}</span></div>
                </div>
                {shouldRenderSparkline(sparklinePoints) ? (
                  <div className="market-card-chart">
                    <MarketSparkline points={sparklinePoints} label={ui.priceTrend} hideWhenEmpty />
                  </div>
                ) : null}
              </div>
              <div className="stack">
                <div className="kv"><span className="kv-key">{closeState.label}</span><span className="kv-value">{market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"}</span></div>
                <div className="close-progress" aria-label={closeState.label}><span style={{ width: `${closeState.progress}%` }} /></div>
              </div>
              <div className="muted compact-meta">
                {copy.closeTime}: {market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"} · {copy.resolution}: {copy.statuses[market.status] ?? market.status} · {copy.source}: {market.source} · {copy.provenance}: {formatProvenance(market)} · {copy.lastSynced}: {market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}
              </div>
              <div className="market-actions compact-actions">
                <Link className="button-link primary-cta" href={detailPath}>{copy.tradeViaPolymarket}</Link>
                <span className="muted disabled-inline-reason">{marketDisabledLabel}</span>
                <Link className="button-link secondary" href={detailPath}>{ui.marketDetails}</Link>
                <TrackedCopyButton
                  value={marketShareUrl}
                  label={ui.copyMarketReferralLink}
                  copiedLabel={ui.copied}
                  eventName="market_share_link_copied"
                  metadata={refCode ? { code: refCode, market: market.slug || market.externalId } : { market: market.slug || market.externalId }}
                />
              </div>
              {market.recentTrades.length > 0 ? (
                <table className="table compact-table">
                  <thead>
                    <tr>
                      <th>{copy.tradeTime}</th>
                      <th>{copy.side}</th>
                      <th>{copy.price}</th>
                      <th>{copy.size}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.recentTrades.slice(0, 3).map((trade) => (
                      <tr key={trade.externalTradeId}>
                        <td>{formatDateTime(locale, trade.tradedAt, "UTC")}</td>
                        <td>{trade.side ? copy.sides[trade.side] ?? trade.side : "—"}</td>
                        <td>{toPriceDisplay(trade.price, locale)}</td>
                        <td>{toDisplay(trade.size, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted">{copy.noRecentTrades}</div>
              )}
            </div>
            );
          })}
          </div>
          </>
        )}
      </section>
      <section className="feed-support stack" aria-label={ui.supportAria}>
        <BuilderFeeDisclosureCard
          locale={locale}
          hasBuilderCode={hasBuilderCode}
          routedTradingEnabled={publicSubmitEnabled}
          tradingStatusLabel={publicTradingStatusLabel}
        />
        <section className="panel disclosure-card stack">
          <strong>{ui.builderSafetyTitle}</strong>
          <p className="muted">{ui.builderSafetyBody}</p>
        </section>
        <details className="panel disclosure-card stack technical-disclosure">
          <summary>{ui.dataStatusTitle}</summary>
          <div className="grid">
            <div className="kv"><span className="kv-key">{ui.dataUrl}</span><span className="kv-value mono">{dataReadiness.dataUrl}</span></div>
            <div className="kv"><span className="kv-key">API base URL configured</span><span className="kv-value">{dataReadiness.apiBaseUrlConfigured ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">same-origin API reachable</span><span className="kv-value">{sameOriginApiReachable ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">external markets endpoint reachable</span><span className="kv-value">{externalMarketsEndpointReachable ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">service API reachable</span><span className="kv-value">{serviceApiReachable ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">Polymarket fallback enabled</span><span className="kv-value">{dataReadiness.polymarketFallbackEnabled ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">fallback used on last request</span><span className="kv-value">{fallbackUsed ? ui.yes : ui.no}</span></div>
            <div className="kv"><span className="kv-key">{ui.tradingStatus}</span><span className="kv-value">{publicTradingStatusLabel}</span></div>
            <div className="kv"><span className="kv-key">Builder Code</span><span className="kv-value">{hasBuilderCode ? ui.builderCodeSet : ui.builderCodeMissing}</span></div>
            <div className="kv"><span className="kv-key">Thirdweb client configured</span><span className="kv-value">{thirdwebClientConfigured ? ui.yes : ui.no}</span></div>
          </div>
        </details>
        <ThirdwebWalletFundingCard surface="polymarket_feed" walletConnected={false} />
      </section>
    </main>
  );
}
