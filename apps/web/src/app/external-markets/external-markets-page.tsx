import React from "react";
import Link from "next/link";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { PolymarketTradeTicket } from "./polymarket-trade-ticket";
import { getCurrentWebUser } from "../auth-session";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";

import {
  getPolymarketRoutingDisabledReasons,
  isPolymarketRoutingFullyEnabled,
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
      if (sort === "close") {
        const aTime = a.closeTime ? new Date(a.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.closeTime ? new Date(b.closeTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      return (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0);
    });
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
    geoblockAllowed: false,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: visibleMarkets.some((market) => market.status === "open"),
    orderValid: true,
    submitterAvailable,
  };
  const routingFullyEnabled = isPolymarketRoutingFullyEnabled(statusInput);
  const disabledReasons = getPolymarketRoutingDisabledReasons(statusInput);
  const disabledReasonLabel = (reason: PolymarketRoutingReadiness) => copy.readinessCopy[reason] ?? reason;

  return (
    <main className="stack">
      <FunnelEventTracker name="market_view" metadata={{ surface: "feed" }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
      </section>
      <section className="panel stack">
        <strong>{copy.builderDebug}</strong>
        <div className="kv"><span className="kv-key">{copy.builderCodeConfigured}</span><span className="kv-value">{hasBuilderCode ? copy.yes : copy.no}</span></div>
        <div className="kv"><span className="kv-key">{copy.routedTradingEnabled}</span><span className="kv-value">{routingFullyEnabled ? copy.yes : copy.readinessCopy.feature_disabled}</span></div>
        <div className="kv"><span className="kv-key">{copy.orderSubmitterMode}</span><span className="kv-value">{submitterMode === "enabled" ? copy.yes : copy.disabled}</span></div>
        {routingFullyEnabled ? null : (
          <ul className="muted">
            {disabledReasons.map((reason) => <li key={reason}>{disabledReasonLabel(reason)}</li>)}
          </ul>
        )}
        <div className="kv"><span className="kv-key">{copy.intendedFees}</span><span className="kv-value">Maker 0.5%, Taker 1%</span></div>
        <div className="muted">{copy.feeNotice}</div>
      </section>
      <BuilderFeeDisclosureCard
        locale={locale}
        hasBuilderCode={hasBuilderCode}
        routedTradingEnabled={routingFullyEnabled}
      />
      <form className="panel filters" action="/polymarket">
        {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}
        <label className="stack">
          搜尋
          <input name="q" defaultValue={params?.q ?? ""} placeholder="搜尋市場、slug 或外部 ID" />
        </label>
        <label className="stack">
          狀態
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
            <option value="close">關閉時間</option>
          </select>
        </label>
        <button type="submit">套用</button>
      </form>
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
          visibleMarkets.map((market) => (
            <div key={`${market.source}:${market.externalId}`} className="panel stack">
              <div className="grid">
                <div className="stack">
                  <div className="badge badge-neutral">{market.source}</div>
                  <strong>{market.title}</strong>
                  <div className={`badge badge-${statusTone(market.status)}`}>{copy.statuses[market.status] ?? market.status}</div>
                  <div className="muted">{copy.externalId}: {market.externalId}</div>
                </div>
                <div className="stack">
                  <div className="kv">
                    <span className="kv-key">{copy.bestBid}</span>
                    <span className="kv-value">{toDisplay(market.bestBid, locale)}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">{copy.bestAsk}</span>
                    <span className="kv-value">{toDisplay(market.bestAsk, locale)}</span>
                  </div>
                  <div className="kv">
                    <span className="kv-key">{copy.lastTrade}</span>
                    <span className="kv-value">{toDisplay(market.lastTradePrice, locale)}</span>
                  </div>
                </div>
              </div>
              {market.outcomes.length > 0 ? (
                <div className="muted">{copy.outcomes}: {market.outcomes.map((outcome) => outcome.title).join(" • ")}</div>
              ) : (
                <div className="muted">{copy.outcomesUnavailable}</div>
              )}
              <div className="muted">{copy.volume24h}: {toDisplay(market.volume24h, locale)} · {copy.liquidity}: {toDisplay(market.liquidity ?? market.volumeTotal, locale)}</div>
              <div className="muted">{copy.closeTime}: {market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"} · {copy.resolution}: {market.resolvedAt ? formatDateTime(locale, market.resolvedAt, "UTC") : copy.statuses[market.status] ?? market.status} · {copy.source}: {market.source} · {copy.provenance}: {formatProvenance(market)} · {copy.lastSynced}: {market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}</div>
              {market.source === "polymarket" ? (
                <div className="market-actions stack">
                {market.marketUrl ? <Link href={market.marketUrl} target="_blank" rel="noreferrer">{copy.openOnPolymarket}</Link> : <span className="muted">{copy.openOnPolymarketUnavailable}</span>}
                <Link href={`/polymarket/${encodeURIComponent(market.slug || market.externalId)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>市場詳情</Link>
                <PolymarketTradeTicket
                  locale={locale}
                  hasBuilderCode={hasBuilderCode}
                  featureEnabled={routedTradingEnabled}
                  submitModeEnabled={submitterMode === "enabled"}
                  loggedIn={Boolean(currentUser)}
                  walletConnected={false}
                  geoblockAllowed={false}
                  hasCredentials={false}
                  userSigningAvailable={false}
                  marketTradable={market.status === "open"}
                  orderValid={Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice)}
                  submitterAvailable={submitterAvailable}
                 marketTitle={market.title}
                  outcomes={market.outcomes.map((outcome) => ({
                    tokenId: outcome.externalOutcomeId,
                    title: outcome.title,
                    bestBid: outcome.bestBid,
                    bestAsk: outcome.bestAsk,
                    lastPrice: outcome.lastPrice,
                  }))}
                  tokenId={market.outcomes[0]?.externalOutcomeId}
                  outcome={market.outcomes[0]?.title ?? "Yes"}
                  side="buy"
                  price={market.lastTradePrice}
                  size={10}
                />
              </div>
              ) : null}
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
          ))
        )}
      </section>
    </main>
  );
}
