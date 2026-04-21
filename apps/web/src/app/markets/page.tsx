import Link from "next/link";

import { listMarkets } from "../../lib/api";
import { formatPrice, formatUsdc } from "../../lib/format";

const getStatusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved") {
    return "success";
  }

  if (status === "halted" || status === "cancelled") {
    return "warning";
  }

  return "neutral";
};

export default async function MarketsPage() {
  const markets = await listMarkets();
  const activeMarkets = markets.filter((market) => market.status === "open").length;
  const resolvedMarkets = markets.filter((market) => market.status === "resolved").length;

  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Live and settled prediction markets with depth, recent activity, and resolution state in one view.</p>
      </section>

      <section className="grid">
        <article className="panel stack">
          <strong>Total markets</strong>
          <div className="metric">{markets.length}</div>
          <div className="muted">Includes active and resolved listings.</div>
        </article>
        <article className="panel stack">
          <strong>Active now</strong>
          <div className="metric">{activeMarkets}</div>
          <div className="muted">Open for order placement and matching.</div>
        </article>
        <article className="panel stack">
          <strong>Resolved</strong>
          <div className="metric">{resolvedMarkets}</div>
          <div className="muted">Settled markets with payout history.</div>
        </article>
      </section>

      {markets.length === 0 ? (
        <section className="panel stack">
          <h2 className="section-title">No markets yet</h2>
          <div className="empty-state">No markets are published yet. Run seed/reset and the staging drill harness, then refresh this page.</div>
        </section>
      ) : (
        <section className="grid">
          {markets.map((market) => (
            <Link className="panel stack" key={market.id} href={`/markets/${market.id}`}>
              <div className={`badge badge-${getStatusTone(market.status)}`}>{market.status}</div>
              <strong>{market.title}</strong>
              <div className="muted">{market.description.length > 100 ? market.description.slice(0, 100) + "…" : market.description}</div>
              <div className="muted">Outcomes: {market.outcomes.map((outcome: { title: string }) => outcome.title).join(" • ") || "None"}</div>
              <div className="grid">
                <div>
                  <div className="muted">Best bid</div>
                  <div className="metric-sm">{formatPrice(market.stats.bestBid)}</div>
                </div>
                <div>
                  <div className="muted">Best ask</div>
                  <div className="metric-sm">{formatPrice(market.stats.bestAsk)}</div>
                </div>
              </div>
              <div className="grid">
                <div>
                  <div className="muted">Last trade</div>
                  <div className="metric-sm">{formatPrice(market.stats.lastTradePrice)}</div>
                </div>
                <div>
                  <div className="muted">Volume</div>
                  <div className="metric-sm">{formatUsdc(market.stats.volumeNotional)}</div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
