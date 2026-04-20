import Link from "next/link";

import { listMarkets } from "../../lib/api";
import { formatPrice, formatUsdc } from "../../lib/format";

const getStatusTone = (status: string): "neutral" | "success" | "warning" => {
  if (status === "resolved") {
    return "success";
  }

  if (status === "paused") {
    return "warning";
  }

  return "neutral";
};

export default async function MarketsPage() {
  const markets = await listMarkets();

  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Active prediction markets. Click any market to view the order book and trade.</p>
      </section>

      {markets.length === 0 ? (
        <section className="panel stack">
          <h2 className="section-title">No markets yet</h2>
          <div className="empty-state">No markets are available right now. Create or sync a market, then refresh this page.</div>
        </section>
      ) : (
        <section className="grid">
          {markets.map((market) => (
            <Link className="panel stack" key={market.id} href={`/markets/${market.id}`}>
              <div className={`badge badge-${getStatusTone(market.status)}`}>{market.status}</div>
              <strong>{market.title}</strong>
              <div className="muted">{market.description.length > 80 ? market.description.slice(0, 80) + "…" : market.description}</div>
              <div className="grid">
                <div>
                  <div className="muted">Bid</div>
                  <div className="metric-sm">{formatPrice(market.stats.bestBid)}</div>
                </div>
                <div>
                  <div className="muted">Ask</div>
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
