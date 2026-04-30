import Link from "next/link";
import React from "react";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { BuilderFeeDisclosureCard } from "../../builder-fee-disclosure-card";
import {
  LiquidityHistoryChart,
  OrderBookDepthChart,
  PriceHistoryChart,
  RecentTradesChart,
  VolumeHistoryChart,
} from "../../charts/market-charts";
import { getCurrentWebUser } from "../../auth-session";
import {
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadinessInput,
} from "../../external-markets/polymarket-routing-readiness";
import { PolymarketTradeTicket } from "../../external-markets/polymarket-trade-ticket";
import { FunnelEventTracker } from "../../funnel-analytics";
import { PendingReferralNotice } from "../../pending-referral-notice";
import { ThirdwebWalletFundingCard } from "../../thirdweb-wallet-funding-card";
import { TrackedCopyButton } from "../../tracked-copy-button";
import { getExternalMarket, getExternalMarketHistory, getExternalMarketOrderbook, getExternalMarketStats, getExternalMarketTrades, listExternalMarkets, type ExternalMarketApiRecord } from "../../../lib/api";
import {
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "../../../lib/external-market-status";
import { defaultLocale, formatDateTime, getLocaleCopy, getLocaleHref, type AppLocale } from "../../../lib/locale";
import { siteCopy } from "../../../lib/i18n";
import { normalizeReferralCode } from "../../../lib/referral-capture";

interface PolymarketSlugPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ ref?: string }>;
}

export const dynamic = "force-dynamic";

const toDisplay = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString(defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

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

const hasValidTradeData = (market: ExternalMarketApiRecord): boolean =>
  Boolean(
    market.outcomes[0]?.externalOutcomeId &&
    hasExternalMarketPriceData(market),
  );

const isMarketTradable = (market: ExternalMarketApiRecord, stale: boolean): boolean =>
  isExternalMarketOpenNow(market) && !stale && hasValidTradeData(market);

export async function renderPolymarketSlugPage(locale: AppLocale, { params, searchParams }: PolymarketSlugPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const refCode = normalizeReferralCode(query?.ref);
  const copy = getLocaleCopy(locale).research;
  const shortCopy = siteCopy[locale];
  const hasBuilderCode = hasPolymarketBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitModeEnabled = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true";
  const submitterAvailable = submitModeEnabled;
  const currentUser = await getCurrentWebUser();
  let market: ExternalMarketApiRecord | null = null;
  let failed = false;

  try {
    market = await getExternalMarket("polymarket", slug, locale);
    if (!market) {
      market = findMarket((await listExternalMarkets(locale, "all")).filter((item) => item.source === "polymarket"), slug);
    }
  } catch (error) {
    failed = true;
    console.error("failed to load Polymarket market detail", error);
  }
  if (failed) {
    const fallbackTitle = formatSlugTitle(slug);
    const unavailableTicketProps = {
      locale,
      hasBuilderCode,
      featureEnabled: routedTradingEnabled,
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
          <p>外部 Polymarket / Gamma / CLOB 資料暫時不可用；頁面已改用安全瀏覽狀態，不會提交交易或更改任何平台餘額。</p>
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
          <p>{copy.empty}</p>
          {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
        </section>
        <div className="panel empty-state">{copy.empty}</div>
        <Link href={`${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>返回 Polymarket 市場</Link>
      </main>
    );
  }
  const loadedMarket = market;
  const [orderbookPayload, trades, history, stats] = await Promise.all([
    getExternalMarketOrderbook("polymarket", loadedMarket.externalId).catch(() => ({ orderbook: loadedMarket.latestOrderbook ?? [], depth: [] })),
    getExternalMarketTrades("polymarket", loadedMarket.externalId).catch(() => loadedMarket.recentTrades),
    getExternalMarketHistory("polymarket", loadedMarket.externalId).catch(() => []),
    getExternalMarketStats("polymarket", loadedMarket.externalId).catch(() => null),
  ]);
  const visibleOrderbook = orderbookPayload.orderbook.length ? orderbookPayload.orderbook : loadedMarket.latestOrderbook ?? [];
  const visibleTrades = trades.length ? trades : loadedMarket.recentTrades;
  const historyPoints = history.map((point) => ({ timestamp: point.timestamp, value: point.price }));
  const volumePoints = history.map((point) => ({ timestamp: point.timestamp, value: point.volume }));
  const liquidityPoints = history.map((point) => ({ timestamp: point.timestamp, value: point.liquidity }));
  const tradePoints = visibleTrades.map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }));
  const stale = stats?.stale || isExternalMarketStale(market);
  const externalDataUnavailable = stale || !stats || history.length === 0 || visibleOrderbook.length === 0;
  const marketTradable = isMarketTradable(market, Boolean(stale));
  const orderValid = hasValidTradeData(market);

  const routingInput: PolymarketRoutingReadinessInput = {
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
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
  const publicTradingReady = routedTradingEnabled && hasBuilderCode && submitterAvailable;
  const detailPath = `${getLocaleHref(locale, `/polymarket/${encodeURIComponent(market.slug || market.externalId)}`)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
  const marketShareUrl = `${siteUrl()}${detailPath}`;
  const tradeTicketProps = {
    locale,
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    submitModeEnabled,
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable,
    orderValid,
    submitterAvailable,
    marketTitle: market.title,
    outcomes: market.outcomes.map((outcome) => ({
      tokenId: outcome.externalOutcomeId,
      title: outcome.title,
      bestBid: outcome.bestBid,
      bestAsk: outcome.bestAsk,
      lastPrice: outcome.lastPrice,
    })),
    tokenId: market.outcomes[0]?.externalOutcomeId,
    outcome: market.outcomes[0]?.title ?? "Yes",
    side: "buy" as const,
    price: market.lastTradePrice ?? market.outcomes[0]?.lastPrice ?? market.outcomes[0]?.bestAsk ?? market.outcomes[0]?.bestBid ?? null,
    size: 10,
  };

  return (
    <main className="stack">
      <FunnelEventTracker name="market_detail_view" metadata={{ market: market.slug || market.externalId }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero">
        <div className="market-card-meta">
          <div className="badge badge-neutral">polymarket</div>
          <div className={`badge badge-${market.status === "open" ? "success" : "warning"}`}>{copy.statuses[market.status] ?? market.status}</div>
          {stale ? <div className="badge badge-warning">資料可能過期</div> : null}
          {!orderValid ? <div className="badge badge-warning">暫無成交資料</div> : null}
          {market.translationStatus === "stale" ? <div className="badge badge-warning">{shortCopy.translationStale}</div> : null}
          {market.locale === "en" && locale !== "en" ? <div className="badge badge-warning">{shortCopy.showingOriginal}</div> : null}
        </div>
        <h1>{market.title}</h1>
        <p>{market.description || copy.subtitle}</p>
        {market.titleOriginal && market.titleOriginal !== market.title ? (
          <details className="original-copy">
            <summary>{locale === "en" ? "Original" : "原文"}</summary>
            <p className="muted">{market.titleOriginal}</p>
            {market.descriptionOriginal ? <p className="muted">{market.descriptionOriginal}</p> : null}
          </details>
        ) : null}
        <p>{copy.nonCustodialNotice}</p>
        {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
        <div className="market-actions">
          <TrackedCopyButton
            value={marketShareUrl}
            label="複製市場推薦連結"
            copiedLabel="已複製"
            eventName="market_share_link_copied"
            metadata={refCode ? { code: refCode, market: market.slug || market.externalId } : { market: market.slug || market.externalId }}
          />
        </div>
      </section>

      <BuilderFeeDisclosureCard locale={locale} hasBuilderCode={hasBuilderCode} routedTradingEnabled={publicTradingReady} />
      <ThirdwebWalletFundingCard surface="polymarket_detail" walletConnected={false} />
      {!marketTradable ? (
        <section className="panel disclosure-card stack">
          <strong>此市場目前不可交易。</strong>
          <p className="muted">已結束、已結算、已取消、資料過期或缺少有效價格資料的市場只供瀏覽，不會開放 Polymarket 路由交易。</p>
        </section>
      ) : null}
      {externalDataUnavailable ? (
        <section className="panel disclosure-card stack">
          <strong>外部資料可能過時或暫時不可用</strong>
          <p className="muted">市場資料可能已過期，請稍後再試。頁面會顯示已同步的市場資料；Gamma / CLOB 即時資料不可用時，圖表、訂單簿或近期成交會以安全空狀態顯示。</p>
        </section>
      ) : null}

      <section className="market-detail-layout">
        <div className="market-detail-primary stack">
      <section className="grid">
        <article className="panel stack">
          <strong>{copy.price}</strong>
          <div className="kv"><span className="kv-key">{copy.lastTrade}</span><span className="kv-value">{toDisplay(market.lastTradePrice)}</span></div>
          <div className="kv"><span className="kv-key">{copy.bestBid}</span><span className="kv-value">{toDisplay(market.bestBid)}</span></div>
          <div className="kv"><span className="kv-key">{copy.bestAsk}</span><span className="kv-value">{toDisplay(market.bestAsk)}</span></div>
        </article>
        <article className="panel stack">
          <strong>{copy.volume24h} / {copy.liquidity}</strong>
          <div className="kv"><span className="kv-key">{copy.volume24h}</span><span className="kv-value">{toDisplay(market.volume24h)}</span></div>
          <div className="kv"><span className="kv-key">{copy.totalVolume}</span><span className="kv-value">{toDisplay(market.volumeTotal)}</span></div>
          <div className="kv"><span className="kv-key">{copy.liquidity}</span><span className="kv-value">{toDisplay(market.liquidity ?? market.volumeTotal)}</span></div>
        </article>
        <article className="panel stack">
          <strong>{copy.resolution}</strong>
          <div className="kv"><span className="kv-key">{copy.statuses[market.status] ?? market.status}</span><span className="kv-value">{market.resolvedAt ? formatDateTime(locale, market.resolvedAt, "UTC") : "—"}</span></div>
          <div className="kv"><span className="kv-key">{copy.closeTime}</span><span className="kv-value">{market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"}</span></div>
        </article>
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.outcomes}</h2>
        {market.outcomes.length === 0 ? (
          <div className="empty-state">{copy.outcomesUnavailable}</div>
        ) : (
          <div className="grid">
            {market.outcomes.map((outcome) => (
              <article className="stack" key={outcome.externalOutcomeId}>
                <strong>{outcome.title}</strong>
                <div className="kv"><span className="kv-key">{copy.price}</span><span className="kv-value">{toDisplay(outcome.lastPrice)}</span></div>
                <div className="kv"><span className="kv-key">{copy.bestBid}</span><span className="kv-value">{toDisplay(outcome.bestBid)}</span></div>
                <div className="kv"><span className="kv-key">{copy.bestAsk}</span><span className="kv-value">{toDisplay(outcome.bestAsk)}</span></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid">
        <PriceHistoryChart points={historyPoints} stale={stale} />
        <VolumeHistoryChart points={volumePoints} stale={stale} />
        <LiquidityHistoryChart points={liquidityPoints} stale={stale} />
      </section>

      <section className="panel stack">
        <h2 className="section-title">{copy.provenance}</h2>
        <div className="kv"><span className="kv-key">{copy.source}</span><span className="kv-value">{market.source}</span></div>
        <div className="kv"><span className="kv-key">{copy.provenance}</span><span className="kv-value">{formatProvenance(market)}</span></div>
        <div className="kv"><span className="kv-key">{copy.externalId}</span><span className="kv-value mono">{market.externalId}</span></div>
        <div className="kv"><span className="kv-key">{copy.lastSynced}</span><span className="kv-value">{market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}</span></div>
        {market.marketUrl ? <Link href={market.marketUrl} target="_blank" rel="noreferrer">{copy.openOnPolymarket}</Link> : <span className="muted">{copy.openOnPolymarketUnavailable}</span>}
      </section>

      <section className="panel stack">
        <h2 className="section-title">推薦分成 / 推薦分享</h2>
        <p className="muted">分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。</p>
        <TrackedCopyButton
          value={marketShareUrl}
          label="複製市場推薦連結"
          copiedLabel="已複製"
          eventName="market_share_link_copied"
          metadata={refCode ? { code: refCode, market: market.slug || market.externalId } : { market: market.slug || market.externalId }}
        />
      </section>

      <section className="grid">
        <article className="panel stack">
          <h2 className="section-title">訂單簿 Orderbook snapshot</h2>
          <OrderBookDepthChart points={orderbookPayload.depth} stale={stale} />
          {visibleOrderbook.length > 0 ? (
            <table className="table compact-table">
              <thead><tr><th>{copy.outcome}</th><th>{copy.bestBid}</th><th>{copy.bestAsk}</th><th>{copy.lastSynced}</th></tr></thead>
              <tbody>
                {visibleOrderbook.map((book) => (
                  <tr key={`${book.externalOutcomeId}:${book.capturedAt}`}>
                    <td>{book.externalOutcomeId}</td>
                    <td>{toDisplay(book.bestBid)}</td>
                    <td>{toDisplay(book.bestAsk)}</td>
                    <td>{formatDateTime(locale, book.capturedAt, "UTC")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">暫時未有訂單簿資料</div>
          )}
        </article>
        <article className="panel stack">
          <h2 className="section-title">近期成交</h2>
          <RecentTradesChart points={tradePoints} stale={stale} />
          {visibleTrades.length > 0 ? (
            <table className="table compact-table">
              <thead><tr><th>{copy.tradeTime}</th><th>{copy.side}</th><th>{copy.price}</th><th>{copy.size}</th></tr></thead>
              <tbody>
                {visibleTrades.map((trade) => (
                  <tr key={trade.externalTradeId}>
                    <td>{formatDateTime(locale, trade.tradedAt, "UTC")}</td>
                    <td>{trade.side ? copy.sides[trade.side] ?? trade.side : "—"}</td>
                    <td>{toDisplay(trade.price)}</td>
                    <td>{toDisplay(trade.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">暫時未有近期成交資料</div>
          )}
        </article>
      </section>

        </div>
        <aside className="market-detail-sidebar">
          <section className="panel sticky-ticket">
            <PolymarketTradeTicket {...tradeTicketProps} />
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
