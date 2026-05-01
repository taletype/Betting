import Link from "next/link";
import React from "react";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { resolvePolymarketDetailSlug } from "../../api/_shared/polymarket-detail-slug";
import {
  LiquidityHistoryChart,
  OrderBookDepthChart,
  PriceHistoryChart,
  RecentTradesChart,
  VolumeHistoryChart,
} from "../../charts/market-charts";
import { getCurrentWebUser } from "../../auth-session";
import {
  getPolymarketRoutingDisabledReasons,
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadiness,
  type PolymarketRoutingReadinessInput,
} from "../../external-markets/polymarket-routing-readiness";
import { PolymarketTradeTicket } from "../../external-markets/polymarket-trade-ticket";
import { FunnelEventTracker } from "../../funnel-analytics";
import { PendingReferralNotice } from "../../pending-referral-notice";
import { TrackedCopyButton } from "../../tracked-copy-button";
import { Breadcrumb, SectionAccordion } from "../../product-ui";
import { getExternalMarket, getExternalMarketHistory, getExternalMarketOrderbook, getExternalMarketStats, getExternalMarketTrades, listExternalMarkets, type ExternalMarketApiRecord } from "../../../lib/api";
import {
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "../../../lib/external-market-status";
import { defaultLocale, formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../../lib/locale";
import { getOriginalMarketTitle, localizeMarketTitle, localizeOutcomeLabel } from "../../../lib/market-localization";
import { normalizeReferralCode } from "../../../lib/referral-capture";
import { getSiteUrl } from "../../../lib/site-url";

interface PolymarketSlugPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ ref?: string; source?: string; externalId?: string }>;
}

export const dynamic = "force-dynamic";

const toDisplay = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString(defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toPriceDisplay = (value: number | null): string =>
  value === null || value <= 0 ? "暫無價格" : value.toLocaleString(defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getOutcomePrice = (market: ExternalMarketApiRecord, yesNo: "yes" | "no"): number | null => {
  const outcome = market.outcomes.find((item) => item.yesNo === yesNo || item.title.toLowerCase() === yesNo);
  return outcome?.lastPrice ?? outcome?.bestAsk ?? outcome?.bestBid ?? null;
};

const isSafeMarketImageUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const getMarketHeroImageUrl = (market: ExternalMarketApiRecord): string | null => {
  if (isSafeMarketImageUrl(market.imageUrl)) return market.imageUrl;
  if (isSafeMarketImageUrl(market.iconUrl)) return market.iconUrl;
  return null;
};

const hasPolymarketBuilderCode = (): boolean => {
  try {
    return getPolymarketBuilderCode() !== null;
  } catch {
    return false;
  }
};

const findMarket = (markets: ExternalMarketApiRecord[], slug: string) => {
  const normalized = slug.toLowerCase();
  return markets.find((market) =>
    market.slug.toLowerCase() === normalized ||
    market.externalId.toLowerCase() === normalized ||
    market.id.toLowerCase() === normalized
  ) ?? null;
};

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

const resolvePolymarketDetailMarket = async (
  slug: string,
  locale: AppLocale,
  options: { source?: string; externalId?: string },
): Promise<{ market: ExternalMarketApiRecord | null; failed: boolean }> => {
  const slugResolution = resolvePolymarketDetailSlug(slug);
  const requestedSource = options.source?.toLowerCase() === "polymarket" ? "polymarket" : null;
  const candidates = uniqueNonEmpty([
    requestedSource ? options.externalId : null,
    ...slugResolution.candidates,
    slugResolution.originalSlug,
  ]);
  const errors: unknown[] = [];

  for (const candidate of candidates) {
    try {
      const market = await getExternalMarket("polymarket", candidate, locale);
      if (market) return { market, failed: false };
    } catch (error) {
      errors.push(error);
    }
  }

  for (const status of ["open", "all"] as const) {
    try {
      const markets = (await listExternalMarkets(locale, status)).filter((item) => item.source === "polymarket");
      for (const candidate of candidates) {
        const market = findMarket(markets, candidate);
        if (market) return { market, failed: false };
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === candidates.length + 2) {
    console.error("failed to load Polymarket market detail", errors.at(-1));
    return { market: null, failed: true };
  }

  return { market: null, failed: false };
};

const formatSlugTitle = (slug: string): string => {
  const decoded = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();

  return decoded.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || slug;
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

const MarketHeroImage = ({ market, alt }: { market: ExternalMarketApiRecord; alt: string }) => {
  const imageUrl = getMarketHeroImageUrl(market);

  if (!imageUrl) {
    return (
      <div className="market-card-image market-card-image-fallback market-hero-image-fallback" aria-hidden="true">
        <span>Polymarket</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      width={1440}
      height={720}
      className="market-card-image market-hero-image"
      loading="eager"
      decoding="async"
      fetchPriority="high"
    />
  );
};

const hasValidTradeData = (market: ExternalMarketApiRecord): boolean =>
  Boolean(
    market.outcomes[0]?.externalOutcomeId &&
    hasExternalMarketPriceData(market),
  );

const isMarketTradable = (market: ExternalMarketApiRecord, stale: boolean): boolean =>
  isExternalMarketOpenNow(market) && !stale && hasValidTradeData(market);

const getStatusFlags = (market: ExternalMarketApiRecord): {
  active: boolean | null;
  closed: boolean | null;
  archived: boolean | null;
  restricted: boolean | null;
} => {
  const provenance = market.sourceProvenance ?? market.provenance;
  const record = provenance && typeof provenance === "object" ? provenance as Record<string, unknown> : {};
  const flags = record.statusFlags && typeof record.statusFlags === "object" ? record.statusFlags as Record<string, unknown> : {};
  const readFlag = (key: string): boolean | null => typeof flags[key] === "boolean" ? flags[key] : null;
  return {
    active: readFlag("active"),
    closed: readFlag("closed"),
    archived: readFlag("archived"),
    restricted: readFlag("restricted"),
  };
};

const yesNo = (value: boolean | null): string => value === null ? "未知" : value ? "是" : "否";

const isMarketDebugVisible = (): boolean => process.env.NEXT_PUBLIC_SHOW_MARKET_DEBUG === "true";

const isAllowlistedPolymarketBetaUser = (user: { id: string; email: string | null } | null): boolean => {
  if (!user) return false;
  const allowlist = (process.env.POLYMARKET_ROUTED_TRADING_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(user.id.toLowerCase()) || Boolean(user.email && allowlist.includes(user.email.toLowerCase()));
};

export async function renderPolymarketSlugPage(locale: AppLocale, { params, searchParams }: PolymarketSlugPageProps) {
  const { slug } = await params;
  const slugResolution = resolvePolymarketDetailSlug(slug);
  const query = await searchParams;
  const refCode = normalizeReferralCode(query?.ref);
  const copy = getLocaleCopy(locale).research;
  const hasBuilderCode = hasPolymarketBuilderCode();
  const globallyRoutedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const betaRoutedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_BETA_ENABLED === "true";
  const submitModeEnabled = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true";
  const submitterAvailable = submitModeEnabled;
  const currentUser = await getCurrentWebUser();
  const betaUserAllowlisted = globallyRoutedTradingEnabled || (betaRoutedTradingEnabled && isAllowlistedPolymarketBetaUser(currentUser));
  const routedTradingEnabled = globallyRoutedTradingEnabled || betaRoutedTradingEnabled;
  const { market, failed } = await resolvePolymarketDetailMarket(slug, locale, {
    source: query?.source,
    externalId: query?.externalId,
  });
  if (failed) {
    const fallbackTitle = formatSlugTitle(slug);
    const unavailableTicketProps = {
      locale,
      hasBuilderCode,
      featureEnabled: routedTradingEnabled,
      betaUserAllowlisted,
      submitModeEnabled,
      loggedIn: Boolean(currentUser),
      walletConnected: false,
      hasCredentials: false,
      userSigningAvailable: false,
      marketTradable: false,
      orderValid: false,
      submitterAvailable,
      marketTitle: fallbackTitle,
      outcomes: [],
      outcome: copy.yes,
      side: "buy" as const,
      price: null,
      size: 10,
    };

    return (
      <main className="stack">
        {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
        <section className="hero">
          <h1>{copy.loadError}</h1>
          <p>外部 Polymarket / Gamma / CLOB 資料暫時不可用；頁面已改用安全瀏覽狀態，不會提交交易或更改任何內部帳務紀錄。</p>
          {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
        </section>
        <div className="panel empty-state">
          <p>{copy.loadError}</p>
          <ul>
            <li>市場 slug：<span className="mono">{slug}</span></li>
            <li>外部資料逾時或暫時未能取得。</li>
            <li>路由交易保持停用；用戶需要自行簽署訂單，平台不託管資金。</li>
          </ul>
        </div>
        <section className="market-detail-layout">
          <div className="market-detail-primary stack">
            <section className="panel stack">
              <h2 className="section-title">外部資料暫時不可用</h2>
              <div className="kv"><span className="kv-key">{copy.externalId}</span><span className="kv-value mono">{slug}</span></div>
              <div className="kv"><span className="kv-key">{copy.provenance}</span><span className="kv-value">Gamma / CLOB unavailable</span></div>
              <div className="kv"><span className="kv-key">{copy.lastSynced}</span><span className="kv-value">{copy.never}</span></div>
            </section>
          </div>
          <aside className="market-detail-sidebar">
            <section className="panel sticky-ticket">
              <PolymarketTradeTicket {...unavailableTicketProps} />
            </section>
          </aside>
        </section>
        <Link href={`${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>返回 Polymarket 市場</Link>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="stack">
        {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
        <section className="hero">
          <h1>暫時未有市場資料</h1>
          <p>找不到此 Polymarket 市場。已嘗試精確 slug、標準化 slug、快取外部 ID，以及 Polymarket Gamma 公開 detail fallback。</p>
          {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
        </section>
        <div className="panel empty-state">
          <strong>市場資料未找到</strong>
          <ul>
            <li>原始 slug：<span className="mono">{slugResolution.decodedSlug}</span></li>
            <li>標準化 slug：<span className="mono">{slugResolution.canonicalSlug}</span></li>
            <li>Gamma fallback：已嘗試</li>
          </ul>
        </div>
        <Link href={`${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>返回 Polymarket 市場</Link>
      </main>
    );
  }
  const loadedMarket = market;
  const localizedTitle = localizeMarketTitle(loadedMarket, locale);
  const originalQuestion = getOriginalMarketTitle(loadedMarket);
  const [orderbookPayload, trades, history, stats] = await Promise.all([
    getExternalMarketOrderbook("polymarket", loadedMarket.externalId).catch(() => ({ orderbook: loadedMarket.latestOrderbook ?? [], depth: [] })),
    getExternalMarketTrades("polymarket", loadedMarket.externalId).catch(() => ({ trades: loadedMarket.recentTrades, recentTrades: loadedMarket.normalizedRecentTrades ?? [] })),
    getExternalMarketHistory("polymarket", loadedMarket.externalId).catch(() => []),
    getExternalMarketStats("polymarket", loadedMarket.externalId).catch(() => null),
  ]);
  const visibleOrderbook = orderbookPayload.orderbook.length ? orderbookPayload.orderbook : loadedMarket.latestOrderbook ?? [];
  const visibleTrades = trades.trades.length ? trades.trades : loadedMarket.recentTrades;
  const normalizedTrades = trades.recentTrades.length ? trades.recentTrades : loadedMarket.normalizedRecentTrades ?? [];
  const historyPoints = (loadedMarket.priceHistory?.length ? loadedMarket.priceHistory : history).map((point) => ({ timestamp: point.timestamp, value: "price" in point ? point.price : null }));
  const volumePoints = (loadedMarket.volumeHistory?.length ? loadedMarket.volumeHistory : history).map((point) => ({ timestamp: point.timestamp, value: "volume" in point ? point.volume : null }));
  const liquidityPoints = (loadedMarket.liquidityHistory?.length ? loadedMarket.liquidityHistory : history).map((point) => ({ timestamp: point.timestamp, value: "liquidity" in point ? point.liquidity : null }));
  const tradePoints = normalizedTrades.length
    ? normalizedTrades.map((trade) => ({ timestamp: trade.timestamp, value: trade.price }))
    : visibleTrades.map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }));
  const stale = stats?.stale || isExternalMarketStale(market);
  const externalDataUnavailable = stale || !stats || history.length === 0 || visibleOrderbook.length === 0;
  const statusFlags = getStatusFlags(market);
  const upstreamTradable = statusFlags.active !== false && statusFlags.archived !== true && statusFlags.restricted !== true;
  const marketTradable = upstreamTradable && isMarketTradable(market, Boolean(stale));
  const orderValid = hasValidTradeData(market);
  const restricted = statusFlags.restricted === true;
  const browseOnly = restricted || stale || !marketTradable;
  const yesPrice = getOutcomePrice(market, "yes");
  const noPrice = getOutcomePrice(market, "no");
  const debugVisible = isMarketDebugVisible();

  const routingInput: PolymarketRoutingReadinessInput = {
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    betaUserAllowlisted,
    submitModeEnabled,
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    geoblockStatus: "unknown",
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable,
    orderValid,
    submitterAvailable,
  };
  const topBlockingReason = getPolymarketTopBlockingReason(routingInput);
  const topBlockingReasonLabel = topBlockingReason ? copy.readinessCopy[topBlockingReason] ?? topBlockingReason : copy.submitUserSignedOrder;
  const disabledReasons = getPolymarketRoutingDisabledReasons(routingInput);
  const tradeActionLabel = (reason: PolymarketRoutingReadiness | null): string => {
    if (reason === "wallet_not_connected") return "連接錢包";
    if (reason === "wallet_funds_insufficient") return "增值錢包";
    if (reason === "credentials_missing") return "設定 Polymarket 交易權限";
    if (reason === "submit_mode_disabled" || reason === "submitter_unavailable" || reason === "feature_disabled") return "實盤提交已停用";
    if (reason === "market_not_tradable") return "市場已關閉";
    if (reason === "invalid_order") return "請輸入有效價格及數量";
    if (reason === "signature_required" || reason === "ready_to_submit") return "準備自行簽署訂單";
    return copy.tradeViaPolymarket;
  };
  const publicSubmitEnabled = globallyRoutedTradingEnabled &&
    hasBuilderCode &&
    submitterAvailable;
  const publicTradingStatusLabel = publicSubmitEnabled ? "實盤提交已啟用" : "交易介面預覽；實盤提交已停用";
  const baseDetailPath = getLocaleHref(locale, `/polymarket/${encodeURIComponent(slug)}`);
  const baseMarketShareUrl = `${getSiteUrl()}${baseDetailPath}`;
  const referralMarketShareUrl = refCode ? `${getSiteUrl()}${baseDetailPath}?ref=${encodeURIComponent(refCode)}` : baseMarketShareUrl;
  const tradeTicketProps = {
    locale,
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    betaUserAllowlisted,
    submitModeEnabled,
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable,
    orderValid,
    submitterAvailable,
    marketTitle: localizedTitle,
    outcomes: market.outcomes.map((outcome) => ({
      tokenId: outcome.externalOutcomeId,
      title: localizeOutcomeLabel(outcome.title, locale),
      bestBid: outcome.bestBid,
      bestAsk: outcome.bestAsk,
      lastPrice: outcome.lastPrice,
    })),
    tokenId: market.outcomes[0]?.externalOutcomeId,
    outcome: localizeOutcomeLabel(market.outcomes[0]?.title ?? "Yes", locale),
    side: "buy" as const,
    price: market.lastTradePrice ?? market.outcomes[0]?.lastPrice ?? market.outcomes[0]?.bestAsk ?? market.outcomes[0]?.bestBid ?? null,
    size: 10,
  };
  const priceSpread = stats?.spread ?? market.spread ?? (market.bestBid !== null && market.bestAsk !== null ? market.bestAsk - market.bestBid : null);
  const lastUpdated = market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never;
  const outcomeChance = (price: number | null): string => price === null || price <= 0 ? "暫無機會率" : `${Math.round(price * 100)}% 機會率`;

  return (
    <main className="stack">
      <FunnelEventTracker name="market_detail_view" metadata={{ market: market.slug || market.externalId }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <Breadcrumb
        items={[
          { label: "首頁", href: getLocaleHref(locale, "/") },
          { label: "Polymarket 市場", href: `${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}` },
          { label: localizedTitle },
        ]}
      />

      <section className="market-detail-layout">
        <div className="market-detail-primary stack">
          <section className="market-header stack">
            <div className="market-card-meta">
              <div className="badge badge-neutral"><span className="source-dot" aria-hidden="true" />POLYMARKET</div>
              <div className={`badge badge-${browseOnly ? "warning" : "success"}`}>{copy.statuses[market.status] ?? market.status}</div>
              <div className="badge badge-info">Beta</div>
              <div className="badge badge-success">非託管</div>
              {!submitModeEnabled ? <div className="badge badge-warning">實盤提交已停用</div> : null}
              {restricted ? <div className="badge badge-warning">市場受限制</div> : null}
            </div>
            <h1 className="market-title">{localizedTitle}</h1>
            <MarketHeroImage market={market} alt={localizedTitle} />
            <div className="grid outcomes">
              <article className="outcome-card yes" data-outcome="yes">
                <span className="outcome-label">YES · <strong>是</strong></span>
                <strong className="outcome-price">{toPriceDisplay(yesPrice)}</strong>
                <span className="outcome-pct">{outcomeChance(yesPrice)}</span>
              </article>
              <article className="outcome-card no" data-outcome="no">
                <span className="outcome-label">NO · <strong>否</strong></span>
                <strong className="outcome-price">{toPriceDisplay(noPrice)}</strong>
                <span className="outcome-pct">{outcomeChance(noPrice)}</span>
              </article>
            </div>
            <div className="market-hero-facts">
              <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{toDisplay(market.volume24h ?? market.volumeTotal)}</span></div>
              <div className="kv"><span className="kv-key">流動性</span><span className="kv-value">{toDisplay(market.liquidity ?? market.volumeTotal)}</span></div>
              <div className="kv"><span className="kv-key">截止時間</span><span className="kv-value">{market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"}</span></div>
              <div className="kv"><span className="kv-key">最後更新</span><span className="kv-value">{lastUpdated}</span></div>
            </div>
            {market.description ? <p className="muted">{market.description}</p> : null}
            <p className="market-hero-warning">{copy.nonCustodialNotice}</p>
            {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
            <div className="market-actions">
              <button type="button" className="button-link primary-cta" disabled>{tradeActionLabel(topBlockingReason)}</button>
              <TrackedCopyButton
                value={baseMarketShareUrl}
                label="複製市場連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={{ market: market.slug || market.externalId, surface: "hero_plain" }}
              />
              <TrackedCopyButton
                value={referralMarketShareUrl}
                label="複製市場推薦連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={refCode ? { code: refCode, market: market.slug || market.externalId } : { market: market.slug || market.externalId }}
              />
            </div>
          </section>

          {!marketTradable ? (
            <section className="panel disclosure-card stack">
              <strong>市場已關閉</strong>
              <p className="muted">此市場已關閉或已結算。</p>
            </section>
          ) : null}
          {externalDataUnavailable ? (
            <section className="panel disclosure-card stack">
              <strong>外部資料可能過時或暫時不可用</strong>
              <p className="muted">市場資料可能已過期，請稍後再試。頁面會顯示已同步的市場資料；Gamma / CLOB 即時資料不可用時，圖表、訂單簿或近期成交會以安全空狀態顯示。</p>
            </section>
          ) : null}

          <SectionAccordion title="價格走勢" badge={historyPoints.length < 2 ? "暫無資料" : undefined} defaultOpen>
            <section className="grid">
              <PriceHistoryChart points={historyPoints} stale={stale} />
              <VolumeHistoryChart points={volumePoints} stale={stale} />
              <LiquidityHistoryChart points={liquidityPoints} stale={stale} />
            </section>
          </SectionAccordion>

          <SectionAccordion title="價格詳情" defaultOpen>
            <div className="price-table">
              <div className="price-group">
                <div className="price-row"><span className="price-row-label">{copy.lastTrade}</span><span className="price-row-val">{toPriceDisplay(market.lastTradePrice)}</span></div>
                <div className="price-row"><span className="price-row-label">{copy.bestBid}</span><span className="price-row-val bid">{toPriceDisplay(market.bestBid)}</span></div>
                <div className="price-row"><span className="price-row-label">{copy.bestAsk}</span><span className="price-row-val ask">{toPriceDisplay(market.bestAsk)}</span></div>
                <div className="price-row"><span className="price-row-label">買賣差價</span><span className="price-row-val">{toPriceDisplay(priceSpread)}</span></div>
              </div>
              <div className="price-group">
                <div className="price-row"><span className="price-row-label">{copy.volume24h}</span><span className="price-row-val">{toDisplay(market.volume24h)}</span></div>
                <div className="price-row"><span className="price-row-label">{copy.totalVolume}</span><span className="price-row-val">{toDisplay(market.volumeTotal)}</span></div>
                <div className="price-row"><span className="price-row-label">{copy.liquidity}</span><span className="price-row-val">{toDisplay(market.liquidity ?? market.volumeTotal)}</span></div>
                <div className="price-row"><span className="price-row-label">{copy.resolution}</span><span className={`price-row-val ${browseOnly ? "warning" : "success"}`}>{copy.statuses[market.status] ?? market.status}</span></div>
              </div>
            </div>
          </SectionAccordion>

          <SectionAccordion title="訂單簿" badge={visibleOrderbook.length === 0 ? "暫無資料" : undefined}>
            <div className="stack">
              <h2 className="section-title">訂單簿 Orderbook snapshot</h2>
              <OrderBookDepthChart points={orderbookPayload.depth} stale={stale} />
              <div className="grid">
                <div className="kv"><span className="kv-key">Bid depth</span><span className="kv-value">{orderbookPayload.depth.filter((point) => point.side === "bid").length.toLocaleString(locale)}</span></div>
                <div className="kv"><span className="kv-key">Ask depth</span><span className="kv-value">{orderbookPayload.depth.filter((point) => point.side === "ask").length.toLocaleString(locale)}</span></div>
              </div>
              {visibleOrderbook.length > 0 ? (
                <table className="table compact-table">
                  <thead><tr><th>{copy.outcome}</th><th>{copy.bestBid}</th><th>{copy.bestAsk}</th><th>{copy.lastSynced}</th></tr></thead>
                  <tbody>
                    {visibleOrderbook.map((book) => (
                      <tr key={`${book.externalOutcomeId}:${book.capturedAt}`}>
                        <td>{book.externalOutcomeId}</td>
                        <td>{toPriceDisplay(book.bestBid)}</td>
                        <td>{toPriceDisplay(book.bestAsk)}</td>
                        <td>{formatDateTime(locale, book.capturedAt, "UTC")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">暫時未有訂單簿資料</div>
              )}
            </div>
          </SectionAccordion>

          <SectionAccordion title="市場規則">
            <section className="original-copy rules-text" aria-label="原始市場問題">
              <strong>原始市場問題：</strong>
              <p className="muted">{originalQuestion || market.title}</p>
              {market.descriptionOriginal || market.description ? <p className="muted">{market.descriptionOriginal ?? market.description}</p> : null}
            </section>
          </SectionAccordion>

          <SectionAccordion title="資料來源">
            <div className="meta-grid">
              <div className="meta-item"><div className="meta-key">{copy.source}</div><div className="meta-val">來源：Polymarket</div></div>
              <div className="meta-item"><div className="meta-key">{copy.provenance}</div><div className="meta-val">資料來源：Polymarket API</div></div>
              <div className="meta-item"><div className="meta-key">{copy.externalId}</div><div className="meta-val mono">{market.externalId}</div></div>
              <div className="meta-item"><div className="meta-key">{copy.lastSynced}</div><div className="meta-val">{lastUpdated}</div></div>
              <div className="meta-item"><div className="meta-key">交易狀態</div><div className="meta-val">{publicTradingStatusLabel}</div></div>
              <div className="meta-item"><div className="meta-key">Builder Code</div><div className="meta-val">{hasBuilderCode ? "Builder Code 已設定" : "Builder Code 未設定"}</div></div>
            </div>
          </SectionAccordion>

          <SectionAccordion title="推薦分成 / 推薦分享" badge="獲取獎勵" defaultOpen>
            <div className="share-block">
              <strong className="share-title">分享市場連結</strong>
              <p className="share-desc">分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。</p>
              <p className="share-desc">交易回贈：合資格交易如產生已確認 Builder 費用收入，交易用戶可獲得交易回贈。實際支付需要人手審批。</p>
              <div className="share-btns">
                <TrackedCopyButton
                  value={baseMarketShareUrl}
                  label="複製市場連結"
                  copiedLabel="已複製"
                  eventName="market_share_link_copied"
                  metadata={{ market: market.slug || market.externalId, surface: "detail_plain" }}
                />
                <TrackedCopyButton
                  value={referralMarketShareUrl}
                  label="複製市場推薦連結"
                  copiedLabel="已複製"
                  eventName="market_share_link_copied"
                  metadata={refCode ? { code: refCode, market: market.slug || market.externalId } : { market: market.slug || market.externalId }}
                />
              </div>
            </div>
          </SectionAccordion>

          <SectionAccordion title="近期成交" badge={visibleTrades.length === 0 ? "暫無資料" : undefined}>
            <RecentTradesChart points={tradePoints} stale={stale} />
            {visibleTrades.length > 0 ? (
              <table className="table compact-table">
                <thead><tr><th>{copy.tradeTime}</th><th>{copy.side}</th><th>{copy.price}</th><th>{copy.size}</th></tr></thead>
                <tbody>
                  {visibleTrades.map((trade) => (
                    <tr key={trade.externalTradeId}>
                      <td>{formatDateTime(locale, trade.tradedAt, "UTC")}</td>
                      <td>{trade.side ? copy.sides[trade.side] ?? trade.side : "—"}</td>
                      <td>{toPriceDisplay(trade.price)}</td>
                      <td>{toDisplay(trade.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">暫時未有近期成交資料</div>
            )}
          </SectionAccordion>

          {debugVisible ? (
            <section className="panel stack">
              <h2 className="section-title">市場資料健康狀態</h2>
              <div className="grid">
                <div className="kv"><span className="kv-key">feed cache available</span><span className="kv-value">{market.sourceProvenance || market.provenance ? "yes" : "unknown"}</span></div>
                <div className="kv"><span className="kv-key">detail fallback available</span><span className="kv-value">yes</span></div>
                <div className="kv"><span className="kv-key">service API reachable</span><span className="kv-value">{failed ? "no" : "yes"}</span></div>
                <div className="kv"><span className="kv-key">Gamma fallback enabled/used</span><span className="kv-value">{formatProvenance(market).includes("gamma-api.polymarket.com") ? "yes" : "enabled"}</span></div>
                <div className="kv"><span className="kv-key">stale cache</span><span className="kv-value">{stale ? "yes" : "no"}</span></div>
                <div className="kv"><span className="kv-key">detail not found</span><span className="kv-value">no</span></div>
                <div className="kv"><span className="kv-key">{copy.provenance}</span><span className="kv-value">{formatProvenance(market)}</span></div>
                <div className="kv"><span className="kv-key">原始 route slug</span><span className="kv-value mono">{slugResolution.decodedSlug}</span></div>
                <div className="kv"><span className="kv-key">Gamma canonical slug</span><span className="kv-value mono">{market.slug}</span></div>
                <div className="kv"><span className="kv-key">active / closed / archived / restricted</span><span className="kv-value">{yesNo(statusFlags.active)} / {yesNo(statusFlags.closed)} / {yesNo(statusFlags.archived)} / {yesNo(statusFlags.restricted)}</span></div>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="market-detail-sidebar">
          <section className="sticky-ticket stack">
            <PolymarketTradeTicket {...tradeTicketProps} />
            <div className="panel stack">
              <strong>分享此市場</strong>
              <p className="muted">登入以保存推薦獎勵</p>
              <p className="muted">登入後可查看推薦、獎勵及支付狀態</p>
              <TrackedCopyButton
                value={baseMarketShareUrl}
                label="複製市場連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={{ market: market.slug || market.externalId, surface: "detail_panel_plain" }}
              />
              <TrackedCopyButton
                value={referralMarketShareUrl}
                label="複製市場推薦連結"
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={refCode ? { code: refCode, market: market.slug || market.externalId, surface: "detail_panel" } : { market: market.slug || market.externalId, surface: "detail_panel" }}
              />
            </div>
            <div className="readiness-checklist stack">
              <div className="section-heading-row">
                <strong>交易準備檢查</strong>
                <span className="badge badge-warning">{topBlockingReasonLabel}</span>
              </div>
              <ul className="readiness-reason-list">
                {(disabledReasons.length ? disabledReasons : ["signature_required" as const]).map((reason) => (
                  <li key={reason}>{copy.readinessCopy[reason] ?? reason}</li>
                ))}
              </ul>
              <p className="muted">交易介面預覽；只有所有生產準備檢查通過且實盤提交啟用後，才會允許提交用戶自行簽署的訂單。</p>
            </div>
          </section>
        </aside>
      </section>

      <details className="mobile-trade-sheet" data-testid="mobile-trade-sheet">
        <summary>
          <span>{copy.tradeViaPolymarket}</span>
          <small>{topBlockingReasonLabel}</small>
        </summary>
        <div className="mobile-sheet-panel">
          <PolymarketTradeTicket {...tradeTicketProps} />
        </div>
      </details>
    </main>
  );
}

export default async function PolymarketSlugPage(props: PolymarketSlugPageProps) {
  return renderPolymarketSlugPage(defaultLocale, props);
}
