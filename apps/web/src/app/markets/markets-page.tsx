import Link from "next/link";

import { listMarkets } from "../../lib/api";
import { formatPrice, formatUsdc } from "../../lib/format";
import { getLocaleCopy, getLocaleHref, type AppLocale } from "../../lib/locale";

const getStatusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved") {
    return "success";
  }

  if (status === "halted" || status === "cancelled") {
    return "warning";
  }

  return "neutral";
};

export async function renderMarketsPage(locale: AppLocale) {
  const copy = getLocaleCopy(locale).markets;
  const markets = await listMarkets().catch((error) => {
    console.error("failed to load markets", error);
    return [];
  });
  const activeMarkets = markets.filter((market) => market.status === "open").length;
  const resolvedMarkets = markets.filter((market) => market.status === "resolved").length;
  const statusLabel = (status: string): string => copy.statuses[status] ?? status;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </section>

      <section className="grid">
        <article className="panel stack">
          <strong>{copy.totalMarkets}</strong>
          <div className="metric">{markets.length}</div>
          <div className="muted">{copy.totalMarketsHint}</div>
        </article>
        <article className="panel stack">
          <strong>{copy.activeNow}</strong>
          <div className="metric">{activeMarkets}</div>
          <div className="muted">{copy.activeNowHint}</div>
        </article>
        <article className="panel stack">
          <strong>{copy.resolved}</strong>
          <div className="metric">{resolvedMarkets}</div>
          <div className="muted">{copy.resolvedHint}</div>
        </article>
      </section>

      {markets.length === 0 ? (
        <section className="panel stack">
          <h2 className="section-title">{copy.noMarketsTitle}</h2>
          <div className="empty-state">{copy.noMarketsBody}</div>
        </section>
      ) : (
        <section className="grid">
          {markets.map((market) => (
            <Link className="panel stack" key={market.id} href={getLocaleHref(locale, `/markets/${market.id}`)}>
              <div className={`badge badge-${getStatusTone(market.status)}`}>{statusLabel(market.status)}</div>
              <strong>{market.title}</strong>
              <div className="muted">{market.description.length > 100 ? market.description.slice(0, 100) + "…" : market.description}</div>
              <div className="muted">{copy.outcomes}: {market.outcomes.map((outcome: { title: string }) => outcome.title).join(" • ") || copy.none}</div>
              <div className="muted">{copy.status}: {statusLabel(market.status)}</div>
              <div className="grid">
                <div>
                  <div className="muted">{copy.bestBid}</div>
                  <div className="metric-sm">{formatPrice(market.stats.bestBid, locale)}</div>
                </div>
                <div>
                  <div className="muted">{copy.bestAsk}</div>
                  <div className="metric-sm">{formatPrice(market.stats.bestAsk, locale)}</div>
                </div>
              </div>
              <div className="grid">
                <div>
                  <div className="muted">{copy.lastTrade}</div>
                  <div className="metric-sm">{formatPrice(market.stats.lastTradePrice, locale)}</div>
                </div>
                <div>
                  <div className="muted">{copy.volume}</div>
                  <div className="metric-sm">{formatUsdc(market.stats.volumeNotional, locale)}</div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
