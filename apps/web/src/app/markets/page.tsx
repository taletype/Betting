import Link from "next/link";

import { listMarkets } from "../../lib/api";

const formatTicks = (value: bigint | null): string => (value === null ? "—" : value.toString());

export default async function MarketsPage() {
  const markets = await listMarkets();

  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Browse live and resolved markets, then open detail pages to trade or claim payouts.</p>
        <p>Live markets now render from the API-backed read layer with DB-derived top-of-book and recent trade stats.</p>
      </section>
      <section className="grid">
        {markets.map((market) => (
          <Link className="panel stack" key={market.id} href={`/markets/${market.id}`}>
            <div className="muted">{market.status.toUpperCase()}</div>
            <strong>{market.title}</strong>
            <div className="muted">Market ID: {market.id.slice(0, 8)}</div>
            <div className="muted">{market.description}</div>
            <div className="grid">
              <div>
                <div className="muted">Best bid</div>
                <div className="metric">{formatTicks(market.stats.bestBid)}</div>
              </div>
              <div>
                <div className="muted">Best ask</div>
                <div className="metric">{formatTicks(market.stats.bestAsk)}</div>
              </div>
            </div>
            <div className="grid">
              <div>
                <div className="muted">Last trade</div>
                <div className="metric">{formatTicks(market.stats.lastTradePrice)}</div>
              </div>
              <div>
                <div className="muted">Volume</div>
                <div className="metric">{market.stats.volumeNotional.toString()}</div>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
