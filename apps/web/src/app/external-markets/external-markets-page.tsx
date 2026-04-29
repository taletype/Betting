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
  listExternalMarkets,
  type ExternalMarketApiRecord,
  type ExternalMarketsLoadErrorCode,
} from "../../lib/api";
import { formatDateTime, getLocaleCopy, type AppLocale } from "../../lib/locale";
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
  if (status === "resolved" || status === "closed") {
    return "success";
  }

  if (status === "cancelled") {
    return "warning";
  }

  return "neutral";
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

const filterAndSortMarkets = (markets: ExternalMarketApiRecord[], params?: MarketFeedSearchParams) => {
  const q = params?.q?.trim().toLowerCase() ?? "";
  const status = params?.status?.trim();
  const sort = params?.sort ?? "trending";
  const market = params?.market?.trim().toLowerCase() ?? "";

  return markets
    .filter((item) => {
      if (q && !`${item.title} ${item.description} ${item.externalId} ${item.slug}`.toLowerCase().includes(q)) {
        return false;
      }
      if (market && item.slug.toLowerCase() !== market && item.externalId.toLowerCase() !== market && item.id.toLowerCase() !== market) {
        return false;
      }
      return !status || status === "all" || item.status === status;
    })
    .sort((a, b) => {
      if (sort === "volume") return (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0);
      if (sort === "liquidity") return (b.liquidity ?? b.volumeTotal ?? 0) - (a.liquidity ?? a.volumeTotal ?? 0);
      if (sort === "close") {
        const aTime = a.closeTime ? new Date(a.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.closeTime ? new Date(b.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      return (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0);
    });
};

const buildFeedHref = (params: MarketFeedSearchParams | undefined, next: MarketFeedSearchParams): string => {
  const search = new URLSearchParams();
  const merged = { ...params, ...next };

  if (merged.q) search.set("q", merged.q);
  if (merged.status && merged.status !== "all") search.set("status", merged.status);
  if (merged.sort && merged.sort !== "trending") search.set("sort", merged.sort);
  if (merged.ref) search.set("ref", merged.ref);

  const query = search.toString();
  return query ? `/polymarket?${query}` : "/polymarket";
};

export async function renderExternalMarketsPage(locale: AppLocale, params?: MarketFeedSearchParams) {
  const copy = getLocaleCopy(locale).research;
  let markets: ExternalMarketApiRecord[] = [];
  let loadFailed = false;
  let loadDiagnostics: ExternalMarketsLoadErrorCode[] = [];
  const hasBuilderCode = hasPolymarketBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitterMode = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true" ? "enabled" : "disabled";
  const submitterAvailable = submitterMode === "enabled";
  const refCode = normalizeReferralCode(params?.ref);
  const currentUser = await getCurrentWebUser();
  const normalizedParams: MarketFeedSearchParams = { ...params, ref: refCode ?? params?.ref ?? undefined };

  try {
    markets = (await listExternalMarkets()).filter((market) => market.source === "polymarket");
  } catch (error) {
    loadFailed = true;
    loadDiagnostics = error instanceof ExternalMarketsLoadError ? error.diagnostics : ["unknown"];
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
      <BuilderFeeDisclosureCard
        locale={locale}
        hasBuilderCode={hasBuilderCode}
        routedTradingEnabled={routedTradingEnabled}
      />
      <section className="panel disclosure-card stack">
        <strong>Builder / 交易安全狀態</strong>
        <p className="muted">單純瀏覽市場不會產生 Builder 費用。只適用於合資格並成功成交的 Polymarket 路由訂單；實際訂單提交預設停用。</p>
      </section>
      <ThirdwebWalletFundingCard surface="polymarket_feed" walletConnected={false} />
      <form className="panel filters market-feed-controls" action="/polymarket">
        {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}
        <label className="stack">
          搜尋
          <input name="q" defaultValue={params?.q ?? ""} placeholder="搜尋市場、slug 或外部 ID" />
        </label>
        <label className="stack">
          類別
          <select name="status" defaultValue={params?.status ?? "all"}>
            <option value="all">全部</option>
            <option value="open">開放</option>
            <option value="closed">已關閉</option>
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
        <Link className="button-link secondary" href={buildFeedHref(normalizedParams, {})}>刷新</Link>
      </form>
      <nav className="chip-row" aria-label="Polymarket 類別">
        {[
          ["all", "全部"],
          ["open", "開放"],
          ["resolved", "已結算"],
          ["closed", "已關閉"],
          ["cancelled", "已取消"],
        ].map(([status, label]) => (
          <Link
            key={status}
            className={`chip ${((params?.status ?? "all") === status) ? "active" : ""}`}
            href={buildFeedHref(normalizedParams, { status })}
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
            href={buildFeedHref(normalizedParams, { sort })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="stack">
        {loadFailed ? (
          <div className="panel empty-state">
            <p>{copy.loadError}</p>
            {loadDiagnostics.length > 0 ? (
              <ul>
                {loadDiagnostics.map((diagnostic) => (
                  <li key={diagnostic}>{copy.loadErrorDetails[diagnostic] ?? diagnostic}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className="panel empty-state">
            <p>{copy.empty}</p>
            <ul>
              <li>{copy.emptyDetails.externalMarketsEmpty}</li>
              <li>{copy.emptyDetails.externalSyncNotRun}</li>
            </ul>
          </div>
        ) : (
          visibleMarkets.map((market) => {
            const detailPath = `/polymarket/${encodeURIComponent(market.slug || market.externalId)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
            const marketTopReason = getPolymarketTopBlockingReason({
              ...statusInput,
              marketTradable: market.status === "open",
              orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice),
            });
            const marketDisabledLabel = marketTopReason ? disabledReasonLabel(marketTopReason) : copy.submitUserSignedOrder;
            const marketShareUrl = `${siteUrl()}${detailPath}`;
            const sparklinePoints = toSparklinePoints(market);
            const closeState = getCloseState(market);

            return (
            <div key={`${market.source}:${market.externalId}`} className="panel stack market-card">
              <div className="market-card-main">
                <div className="stack">
                  <div className="market-card-meta">
                    <div className="badge badge-neutral">{market.source}</div>
                    <div className={`badge badge-${statusTone(market.status)}`}>{copy.statuses[market.status] ?? market.status}</div>
                  </div>
                  <strong className="market-card-title">{market.title}</strong>
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
                {copy.closeTime}: {market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"} · {copy.provenance}: {formatProvenance(market)} · {copy.lastSynced}: {market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}
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
    </main>
  );
}
