import Link from "next/link";

import { listMarkets } from "../../lib/api";

const formatTicks = (value: bigint | null): string => (value === null ? "—" : value.toString());

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
        <p>Browse active and resolved markets, then open a market detail page to review order book and recent trade flow.</p>
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
              <div className="muted">Market ID: {market.id.slice(0, 8)}</div>
              <div className="muted">{market.description}</div>
              <div className="grid">
                <div>
                  <div className="muted">Best bid</div>
                  <div className="metric-sm">{formatTicks(market.stats.bestBid)}</div>
                </div>
                <div>
                  <div className="muted">Best ask</div>
                  <div className="metric-sm">{formatTicks(market.stats.bestAsk)}</div>
                </div>
              </div>
              <div className="grid">
                <div>
                  <div className="muted">Last trade</div>
                  <div className="metric-sm">{formatTicks(market.stats.lastTradePrice)}</div>
                </div>
                <div>
                  <div className="muted">Total volume</div>
                  <div className="metric-sm">{market.stats.volumeNotional.toString()}</div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
