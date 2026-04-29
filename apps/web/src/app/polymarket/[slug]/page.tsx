import Link from "next/link";
import React from "react";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { BuilderFeeDisclosureCard } from "../../builder-fee-disclosure-card";
import { getCurrentWebUser } from "../../auth-session";
import {
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadinessInput,
} from "../../external-markets/polymarket-routing-readiness";
import { PolymarketTradeTicket } from "../../external-markets/polymarket-trade-ticket";
import { FunnelEventTracker } from "../../funnel-analytics";
import { PendingReferralNotice } from "../../pending-referral-notice";
import { TrackedCopyButton } from "../../tracked-copy-button";
import { listExternalMarkets, type ExternalMarketApiRecord } from "../../../lib/api";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";
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

export default async function PolymarketSlugPage({ params, searchParams }: PolymarketSlugPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const refCode = normalizeReferralCode(query?.ref);
  const copy = getLocaleCopy(defaultLocale).research;
  const hasBuilderCode = hasPolymarketBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitModeEnabled = process.env.POLYMARKET_CLOB_SUBMITTER === "real" || process.env.POLYMARKET_SUBMITTER_AVAILABLE === "true";
  const submitterAvailable = submitModeEnabled;
  const currentUser = await getCurrentWebUser();
  let market: ExternalMarketApiRecord | null = null;
  let failed = false;

  try {
    market = findMarket((await listExternalMarkets()).filter((item) => item.source === "polymarket"), slug);
  } catch (error) {
    failed = true;
    console.error("failed to load Polymarket market detail", error);
  }

  if (failed) {
    return (
      <main className="stack">
        <section className="hero">
          <h1>{copy.loadError}</h1>
          <p>{copy.subtitle}</p>
        </section>
        <div className="panel empty-state">{copy.loadError}</div>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="stack">
        <section className="hero">
          <h1>暫時未有市場資料</h1>
          <p>{copy.empty}</p>
        </section>
        <div className="panel empty-state">{copy.empty}</div>
        <Link href={refCode ? `/polymarket?ref=${encodeURIComponent(refCode)}` : "/polymarket"}>返回 Polymarket 市場</Link>
      </main>
    );
  }

  const routingInput: PolymarketRoutingReadinessInput = {
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    submitModeEnabled,
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    geoblockStatus: "unknown",
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: market.status === "open",
    orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice),
    submitterAvailable,
  };
  const topBlockingReason = getPolymarketTopBlockingReason(routingInput);
  const topBlockingReasonLabel = topBlockingReason ? copy.readinessCopy[topBlockingReason] ?? topBlockingReason : copy.submitUserSignedOrder;
  const detailPath = `/polymarket/${encodeURIComponent(market.slug || market.externalId)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
  const marketShareUrl = `${siteUrl()}${detailPath}`;
  const tradeTicketProps = {
    locale: defaultLocale,
    hasBuilderCode,
    featureEnabled: routedTradingEnabled,
    submitModeEnabled,
    loggedIn: Boolean(currentUser),
    walletConnected: false,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: market.status === "open",
    orderValid: Boolean(market.outcomes[0]?.externalOutcomeId && market.lastTradePrice),
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
    price: market.lastTradePrice,
    size: 10,
  };

  return (
    <main className="stack">
      <FunnelEventTracker name="market_view" metadata={{ market: market.slug || market.externalId }} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero">
        <div className="badge badge-neutral">polymarket</div>
        <h1>{market.title}</h1>
        <p>{market.description || copy.subtitle}</p>
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

      <BuilderFeeDisclosureCard locale={defaultLocale} hasBuilderCode={hasBuilderCode} routedTradingEnabled={routedTradingEnabled} />

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
          <div className="kv"><span className="kv-key">{copy.statuses[market.status] ?? market.status}</span><span className="kv-value">{market.resolvedAt ? formatDateTime(defaultLocale, market.resolvedAt, "UTC") : "—"}</span></div>
          <div className="kv"><span className="kv-key">{copy.closeTime}</span><span className="kv-value">{market.closeTime ? formatDateTime(defaultLocale, market.closeTime, "UTC") : "—"}</span></div>
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

      <section className="panel stack">
        <h2 className="section-title">{copy.provenance}</h2>
        <div className="kv"><span className="kv-key">{copy.source}</span><span className="kv-value">{market.source}</span></div>
        <div className="kv"><span className="kv-key">{copy.provenance}</span><span className="kv-value">{formatProvenance(market)}</span></div>
        <div className="kv"><span className="kv-key">{copy.externalId}</span><span className="kv-value mono">{market.externalId}</span></div>
        <div className="kv"><span className="kv-key">{copy.lastSynced}</span><span className="kv-value">{market.lastUpdatedAt || market.lastSyncedAt ? formatDateTime(defaultLocale, market.lastUpdatedAt ?? market.lastSyncedAt!, "UTC") : copy.never}</span></div>
        {market.marketUrl ? <Link href={market.marketUrl} target="_blank" rel="noreferrer">{copy.openOnPolymarket}</Link> : <span className="muted">{copy.openOnPolymarketUnavailable}</span>}
      </section>

      <section className="panel stack">
        <h2 className="section-title">推薦分成</h2>
        <p className="muted">已確認 Builder 費用收入分配：平台 60%、直接推薦人 30%、交易者回贈 10%。沒有直接推薦人時，推薦人份額撥入平台份額。</p>
      </section>

      <section className="grid">
        <article className="panel stack">
          <h2 className="section-title">Orderbook snapshot</h2>
          {market.latestOrderbook && market.latestOrderbook.length > 0 ? (
            <table className="table compact-table">
              <thead><tr><th>{copy.outcome}</th><th>{copy.bestBid}</th><th>{copy.bestAsk}</th><th>{copy.lastSynced}</th></tr></thead>
              <tbody>
                {market.latestOrderbook.map((book) => (
                  <tr key={`${book.externalOutcomeId}:${book.capturedAt}`}>
                    <td>{book.externalOutcomeId}</td>
                    <td>{toDisplay(book.bestBid)}</td>
                    <td>{toDisplay(book.bestAsk)}</td>
                    <td>{formatDateTime(defaultLocale, book.capturedAt, "UTC")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">暫無 orderbook snapshot。</div>
          )}
        </article>
        <article className="panel stack">
          <h2 className="section-title">近期成交</h2>
          {market.recentTrades.length > 0 ? (
            <table className="table compact-table">
              <thead><tr><th>{copy.tradeTime}</th><th>{copy.side}</th><th>{copy.price}</th><th>{copy.size}</th></tr></thead>
              <tbody>
                {market.recentTrades.map((trade) => (
                  <tr key={trade.externalTradeId}>
                    <td>{formatDateTime(defaultLocale, trade.tradedAt, "UTC")}</td>
                    <td>{trade.side ? copy.sides[trade.side] ?? trade.side : "—"}</td>
                    <td>{toDisplay(trade.price)}</td>
                    <td>{toDisplay(trade.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">{copy.noRecentTrades}</div>
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
