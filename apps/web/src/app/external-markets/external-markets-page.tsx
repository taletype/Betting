import React from "react";
import Link from "next/link";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { getCurrentWebUser } from "../auth-session";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { MarketSparkline, MiniMetricTrend, type TimeSeriesPoint } from "../charts/market-charts";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";
import { TrackedCopyButton } from "../tracked-copy-button";
import { ThirdwebWalletFundingCard } from "../thirdweb-wallet-funding-card";

import {
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadinessInput,
  type PolymarketRoutingReadiness,
} from "./polymarket-routing-readiness";
import {
  ExternalMarketsLoadError,
  getPublicExternalMarketsReadiness,
  listExternalMarkets,
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
import { siteCopy } from "../../lib/i18n";
import { normalizeReferralCode } from "../../lib/referral-capture";

const toDisplay = (value: number | null, locale: AppLocale): string =>
  value === null ? "—" : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

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

const statusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "cancelled" || status === "resolved" || status === "closed") {
    return "warning";
  }

  return "success";
};

const getCloseState = (market: ExternalMarketApiRecord): { label: string; progress: number } => {
  if (market.status === "closed" || market.status === "resolved" || market.status === "cancelled") {
    return { label: "已結束", progress: 100 };
  }

  if (!market.closeTime) return { label: "進行中", progress: 42 };

  const remaining = new Date(market.closeTime).getTime() - Date.now();
  if (remaining <= 0) return { label: "已結束", progress: 100 };
  if (remaining <= 24 * 60 * 60 * 1000) return { label: "即將結束", progress: 86 };
  return { label: "進行中", progress: 48 };
};

const toSparklinePoints = (market: ExternalMarketApiRecord): TimeSeriesPoint[] =>
  market.recentTrades
    .filter((trade) => trade.price !== null)
    .slice(0, 12)
    .reverse()
    .map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }));

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

const isDefaultFeedStatus = (status: string | undefined): boolean => !status || !["all", "open", "closed", "resolved", "cancelled"].includes(status);

const isDefaultFeedMarket = (market: ExternalMarketApiRecord): boolean =>
  isExternalMarketOpenNow(market) &&
  hasExternalMarketActivity(market) &&
  hasExternalMarketPriceData(market) &&
  !isExternalMarketStale(market);

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

  return markets
    .filter((item) => {
      if (q && !`${item.title} ${item.description} ${item.externalId} ${item.slug}`.toLowerCase().includes(q)) {
        return false;
      }
      if (market && item.slug.toLowerCase() !== market && item.externalId.toLowerCase() !== market && item.id.toLowerCase() !== market) {
        return false;
      }
      if (defaultFeed) {
        return isDefaultFeedMarket(item);
      }
      return status === "all" || item.status === status;
    })
    .sort((a, b) => {
      const statusDelta = (b.status === "open" ? 1 : 0) - (a.status === "open" ? 1 : 0);
      if (statusDelta !== 0) return statusDelta;
      if (sort === "volume") return (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0);
      if (sort === "liquidity") return (b.liquidity ?? b.volumeTotal ?? 0) - (a.liquidity ?? a.volumeTotal ?? 0);
      if (sort === "close") {
        const aTime = a.closeTime ? new Date(a.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.closeTime ? new Date(b.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      const volumeDelta = (b.volume24h ?? 0) - (a.volume24h ?? 0);
      if (volumeDelta !== 0) return volumeDelta;
      const liquidityDelta = (b.liquidity ?? b.volumeTotal ?? 0) - (a.liquidity ?? a.volumeTotal ?? 0);
      if (liquidityDelta !== 0) return liquidityDelta;
      const qualityDelta = qualityScore(b) - qualityScore(a);
      if (qualityDelta !== 0) return qualityDelta;
      return (toTime(b.lastUpdatedAt ?? b.lastSyncedAt ?? b.updatedAt) ?? 0) - (toTime(a.lastUpdatedAt ?? a.lastSyncedAt ?? a.updatedAt) ?? 0);
    });
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

const sanitizeSourceName = (source: string): string | null => {
  const trimmed = source.trim();
  if (!trimmed || /[?#@=]/.test(trimmed)) return null;
  return /^[a-z0-9._:/-]+$/i.test(trimmed) ? trimmed : null;
};

export async function renderExternalMarketsPage(locale: AppLocale, params?: MarketFeedSearchParams) {
  const copy = getLocaleCopy(locale).research;
  let markets: ExternalMarketApiRecord[] = [];
  let loadFailed = false;
  let loadDiagnostics: ExternalMarketsLoadErrorCode[] = [];
  let failedSources: string[] = [];
  const hasBuilderCode = hasPolymarketBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true" ? "enabled" : "disabled";
  const submitterAvailable = submitterMode === "enabled";
  const refCode = normalizeReferralCode(params?.ref);
  const currentUser = await getCurrentWebUser();
  const normalizedParams: MarketFeedSearchParams = { ...params, ref: refCode ?? params?.ref ?? undefined };
  const dataReadiness = getPublicExternalMarketsReadiness();
  const selectedStatus = params?.status?.trim();
  const defaultFeed = isDefaultFeedStatus(selectedStatus);
  const requestedStatus: ExternalMarketStatusQuery =
    !selectedStatus || defaultFeed
      ? "open"
      : selectedStatus === "all" || selectedStatus === "closed" || selectedStatus === "resolved" || selectedStatus === "cancelled"
        ? selectedStatus
        : "open";

  try {
    markets = (await listExternalMarkets(locale, requestedStatus)).filter((market) => market.source === "polymarket");
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
  const shareUrl = refCode ? `${siteUrl()}/polymarket?ref=${encodeURIComponent(refCode)}` : `${siteUrl()}/polymarket`;
  const externalMarketsEndpointReachable = !loadFailed;
  const sameOriginApiReachable = dataReadiness.sameOriginApiSelected ? !loadFailed : true;
  const serviceApiReachable = dataReadiness.serviceApiSelected ? !loadFailed : dataReadiness.configuredApiBaseIsWebOrigin ? false : dataReadiness.apiBaseUrlConfigured;
  const thirdwebClientConfigured = Boolean(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim());
  const staleMarketsPresent = markets.some(isExternalMarketStale);
  const staleOpenMarketsPresent = markets.some((market) => isExternalMarketOpenNow(market) && isExternalMarketStale(market));
  const publicTradingReady = routedTradingEnabled && hasBuilderCode && submitterAvailable;

  return (
    <main className="stack">
      <FunnelEventTracker name="market_view" metadata={{ surface: "feed" }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        {refCode ? <div className="banner banner-success referral-banner">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice prefix="你正在使用推薦碼：" />}
        <div className="market-actions">
          <TrackedCopyButton
            value={shareUrl}
            label="複製一般邀請連結"
            copiedLabel="已複製"
            eventName="invite_link_copied"
            metadata={refCode ? { code: refCode, surface: "polymarket_feed" } : { surface: "polymarket_feed" }}
          />
        </div>
      </section>
      <form className="panel filters market-feed-controls" action={getLocaleHref(locale, "/polymarket")}>
        {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}
        <label className="stack">
          搜尋
          <input name="q" defaultValue={params?.q ?? ""} placeholder="搜尋市場、slug 或外部 ID" />
        </label>
        <label className="stack">
          類別
          <select name="status" defaultValue={defaultFeed ? "open" : selectedStatus}>
            <option value="all">全部</option>
            <option value="open">開放</option>
            <option value="closed">已結束</option>
            <option value="resolved">已結算</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
        <label className="stack">
          排序
          <select name="sort" defaultValue={params?.sort ?? "trending"}>
            <option value="trending">熱門</option>
            <option value="volume">成交量</option>
            <option value="liquidity">流動性</option>
            <option value="close">即將結束</option>
          </select>
        </label>
        <button type="submit">套用</button>
        <Link className="button-link secondary" href={buildLocalizedFeedHref(locale, normalizedParams, {})}>刷新</Link>
      </form>
      <nav className="chip-row" aria-label="Polymarket 類別">
        {[
          ["all", "全部"],
          ["open", "開放"],
          ["resolved", "已結算"],
          ["closed", "已結束"],
          ["cancelled", "已取消"],
        ].map(([status, label]) => (
          <Link
            key={status}
            className={`chip ${((defaultFeed ? "open" : selectedStatus) === status) ? "active" : ""}`}
            href={buildLocalizedFeedHref(locale, normalizedParams, { status })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav className="tab-row" aria-label="Polymarket 排序">
        {[
          ["trending", "熱門"],
          ["volume", "成交量"],
          ["liquidity", "流動性"],
          ["close", "即將結束"],
        ].map(([sort, label]) => (
          <Link
            key={sort}
            className={`tab-link ${((params?.sort ?? "trending") === sort) ? "active" : ""}`}
            href={buildLocalizedFeedHref(locale, normalizedParams, { sort })}
          >
            {label}
          </Link>
        ))}
      </nav>
      {staleMarketsPresent ? (
        <div className="banner banner-warning">市場資料可能已過期，請稍後再試。</div>
      ) : null}
      <section className="stack">
        {loadFailed ? (
          <div className="panel empty-state">
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
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className="panel empty-state">
            <p>{defaultFeed && staleOpenMarketsPresent ? "市場資料可能已過期，請稍後再試。" : defaultFeed ? "暫時未有活躍市場資料" : copy.empty}</p>
            {defaultFeed ? (
              <Link className="button-link secondary" href={buildLocalizedFeedHref(locale, normalizedParams, { status: "all" })}>查看全部市場</Link>
            ) : (
              <ul>
                <li>{copy.emptyDetails.externalMarketsEmpty}</li>
                <li>{copy.emptyDetails.externalSyncNotRun}</li>
              </ul>
            )}
          </div>
        ) : (
          visibleMarkets.map((market) => {
            const detailBase = getLocaleHref(locale, `/polymarket/${encodeURIComponent(market.slug || market.externalId)}`);
            const detailPath = `${detailBase}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
            const marketTopReason = getPolymarketTopBlockingReason({
              ...statusInput,
              marketTradable: market.status === "open",
              orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice),
            });
            const marketDisabledLabel = marketTopReason ? disabledReasonLabel(marketTopReason) : copy.submitUserSignedOrder;
            const marketShareUrl = `${siteUrl()}${detailPath}`;
            const sparklinePoints = toSparklinePoints(market);
            const closeState = getCloseState(market);
            const stale = isExternalMarketStale(market);
            const noTradeData = !hasExternalMarketActivity(market) || !hasExternalMarketPriceData(market);

            return (
            <div key={`${market.source}:${market.externalId}`} className="panel stack market-card">
              <div className="market-card-main">
                <div className="stack">
                  <div className="market-card-meta">
                    <div className="badge badge-neutral">{market.source}</div>
                    <div className={`badge badge-${statusTone(market.status)}`}>{copy.statuses[market.status] ?? market.status}</div>
                    {stale ? <div className="badge badge-warning">資料可能過期</div> : null}
                    {noTradeData ? <div className="badge badge-warning">暫無成交資料</div> : null}
                    {translationBadge(market, locale) ? <div className="badge badge-warning">{translationBadge(market, locale)}</div> : null}
                  </div>
                  <strong className="market-card-title">{market.title}</strong>
                  {market.titleOriginal && market.titleOriginal !== market.title ? (
                    <details className="original-copy">
                      <summary>{locale === "en" ? "Original" : "原文"}</summary>
                      <p className="muted">{market.titleOriginal}</p>
                    </details>
                  ) : null}
                  <div className="outcome-pill-row">
                    {market.outcomes.length > 0 ? (
                      market.outcomes.slice(0, 4).map((outcome) => (
                        <span className="outcome-pill" key={outcome.externalOutcomeId}>
                          <span>{outcome.title}</span>
                          <strong>{toDisplay(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid, locale)}</strong>
                        </span>
                      ))
                    ) : (
                      <span className="muted">{copy.outcomesUnavailable}</span>
                    )}
                  </div>
                </div>
                <div className="market-card-stats">
                  <div className="kv"><span className="kv-key">{copy.lastTrade}</span><span className="kv-value">{toDisplay(market.lastTradePrice, locale)}</span></div>
                  <div className="kv"><span className="kv-key">{copy.bestBid}</span><span className="kv-value">{toDisplay(market.bestBid, locale)}</span></div>
                  <div className="kv"><span className="kv-key">{copy.bestAsk}</span><span className="kv-value">{toDisplay(market.bestAsk, locale)}</span></div>
                  <MiniMetricTrend label={copy.volume24h} value={toDisplay(market.volume24h, locale)} points={sparklinePoints} />
                  <div className="kv"><span className="kv-key">{copy.liquidity}</span><span className="kv-value">{toDisplay(market.liquidity ?? market.volumeTotal, locale)}</span></div>
                </div>
                <div className="market-card-chart">
                  <MarketSparkline points={sparklinePoints} label="價格走勢" />
                </div>
              </div>
              <div className="stack">
                <div className="kv"><span className="kv-key">{closeState.label}</span><span className="kv-value">{market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"}</span></div>
                <div className="close-progress" aria-label={closeState.label}><span style={{ width: `${closeState.progress}%` }} /></div>
              </div>
              <div className="muted compact-meta">
                {copy.closeTime}: {market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"} · {copy.resolution}: {copy.statuses[market.status] ?? market.status} · {copy.source}: {market.source} · {copy.provenance}: {formatProvenance(market)} · {copy.lastSynced}: {market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}
              </div>
              <div className="market-actions compact-actions">
                {market.marketUrl ? <Link className="button-link secondary" href={market.marketUrl} target="_blank" rel="noreferrer">{copy.openOnPolymarket}</Link> : <span className="muted">{copy.openOnPolymarketUnavailable}</span>}
                <Link className="button-link secondary" href={detailPath}>市場詳情</Link>
                <button type="button" disabled title={marketDisabledLabel}>{copy.tradeViaPolymarket}</button>
                <span className="muted disabled-inline-reason">{marketDisabledLabel}</span>
                <TrackedCopyButton
                  value={marketShareUrl}
                  label="複製市場推薦連結"
                  copiedLabel="已複製"
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
                        <td>{toDisplay(trade.price, locale)}</td>
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
          })
        )}
      </section>
      <section className="feed-support stack" aria-label="安全及營運資訊">
        <BuilderFeeDisclosureCard
          locale={locale}
          hasBuilderCode={hasBuilderCode}
          routedTradingEnabled={publicTradingReady}
        />
        <section className="panel disclosure-card stack">
          <strong>Builder / 交易安全狀態</strong>
          <p className="muted">單純瀏覽市場不會產生 Builder 費用。只適用於合資格並成功成交的 Polymarket 路由訂單；實際訂單提交預設停用。</p>
        </section>
        <details className="panel disclosure-card stack technical-disclosure">
          <summary>市場資料連線狀態</summary>
          <div className="grid">
            <div className="kv"><span className="kv-key">資料 URL</span><span className="kv-value mono">{dataReadiness.dataUrl}</span></div>
            <div className="kv"><span className="kv-key">API base URL configured</span><span className="kv-value">{dataReadiness.apiBaseUrlConfigured ? "yes" : "no"}</span></div>
            <div className="kv"><span className="kv-key">same-origin API reachable</span><span className="kv-value">{sameOriginApiReachable ? "yes" : "no"}</span></div>
            <div className="kv"><span className="kv-key">external markets endpoint reachable</span><span className="kv-value">{externalMarketsEndpointReachable ? "yes" : "no"}</span></div>
            <div className="kv"><span className="kv-key">service API reachable</span><span className="kv-value">{serviceApiReachable ? "yes" : "no"}</span></div>
            <div className="kv"><span className="kv-key">Polymarket fallback enabled</span><span className="kv-value">{dataReadiness.polymarketFallbackEnabled ? "yes" : "no"}</span></div>
            <div className="kv"><span className="kv-key">fallback used on last request</span><span className="kv-value">no</span></div>
            <div className="kv"><span className="kv-key">交易功能</span><span className="kv-value">{publicTradingReady ? "交易功能已啟用" : "交易功能尚未啟用"}</span></div>
            <div className="kv"><span className="kv-key">Builder Code</span><span className="kv-value">{hasBuilderCode ? "Builder Code 已設定" : "Builder Code 未設定"}</span></div>
            <div className="kv"><span className="kv-key">Thirdweb client configured</span><span className="kv-value">{thirdwebClientConfigured ? "yes" : "no"}</span></div>
          </div>
        </details>
        <ThirdwebWalletFundingCard surface="polymarket_feed" walletConnected={false} />
      </section>
    </main>
  );
}
