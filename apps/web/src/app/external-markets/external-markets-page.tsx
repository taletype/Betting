import React from "react";
import Link from "next/link";

import { getPolymarketBuilderCode } from "@bet/integrations";

import { PolymarketTradeTicket } from "./polymarket-trade-ticket";

import { listExternalMarkets, type ExternalMarketApiRecord } from "../../lib/api";
import { formatDateTime, getLocaleCopy, type AppLocale } from "../../lib/locale";

const toDisplay = (value: number | null, locale: AppLocale): string =>
  value === null ? "—" : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export async function renderExternalMarketsPage(locale: AppLocale) {
  const copy = getLocaleCopy(locale).research;
  let markets: ExternalMarketApiRecord[] = [];
  let loadFailed = false;
  const showPolymarketTradeCta = hasPolymarketBuilderCode();
  const routedTradingEnabled = process.env.POLYMARKET_ROUTED_TRADING_ENABLED === "true";
  const submitterMode = routedTradingEnabled && showPolymarketTradeCta ? "mock" : "disabled";

  try {
    markets = await listExternalMarkets();
  } catch (error) {
    loadFailed = true;
    console.error("failed to load external markets", error);
  }

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </section>
      <section className="panel stack">
        <strong>Builder Routing Debug</strong>
        <div className="kv"><span className="kv-key">builder code configured</span><span className="kv-value">{showPolymarketTradeCta ? "yes" : "no"}</span></div>
        <div className="kv"><span className="kv-key">routed trading enabled</span><span className="kv-value">{routedTradingEnabled ? "yes" : "no"}</span></div>
        <div className="kv"><span className="kv-key">order submitter mode</span><span className="kv-value">{submitterMode}</span></div>
        <div className="kv"><span className="kv-key">intended fees</span><span className="kv-value">taker 0.25%, maker 0%</span></div>
        <div className="muted">Actual fees are configured in Polymarket Builder settings, not locally.</div>
      </section>
      <section className="stack">
        {loadFailed ? (
          <div className="panel empty-state">{copy.loadError}</div>
        ) : markets.length === 0 ? (
          <div className="panel empty-state">{copy.empty}</div>
        ) : (
          markets.map((market) => (
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
                    <span className="kv-key">Price</span>
                    <span className="kv-value">{toDisplay(market.lastTradePrice, locale)}</span>
                  </div>
                </div>
              </div>
              {market.outcomes.length > 0 ? (
                <div className="muted">{copy.outcomes}: {market.outcomes.map((outcome) => outcome.title).join(" • ")}</div>
              ) : (
                <div className="muted">{copy.outcomesUnavailable}</div>
              )}
              <div className="muted">{copy.volume24h}: {toDisplay(market.volume24h, locale)} · Liquidity: {toDisplay(market.volumeTotal, locale)}</div>
              <div className="muted">Close time: {market.closeTime ? formatDateTime(locale, market.closeTime, "UTC") : "—"} · Resolution: {market.resolvedAt ? formatDateTime(locale, market.resolvedAt, "UTC") : market.status} · Source: {market.source} · {copy.lastSynced}: {market.lastSyncedAt ? formatDateTime(locale, market.lastSyncedAt, "UTC") : copy.never}</div>
              {market.source === "polymarket" && showPolymarketTradeCta ? (
                <div className="stack">
                {market.marketUrl ? <Link href={market.marketUrl} target="_blank" rel="noreferrer">Open on Polymarket</Link> : <span className="muted">Open on Polymarket link unavailable</span>}
                <PolymarketTradeTicket
                  hasBuilderCode={showPolymarketTradeCta}
                  featureEnabled={routedTradingEnabled}
                  walletConnected={false}
                  hasCredentials={false}
                  marketTradable={market.status === "open"}
                 marketTitle={market.title}
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
