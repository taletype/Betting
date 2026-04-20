import Link from "next/link";

import { apiRequest } from "../../lib/api";

interface MarketRow {
  id: string;
  title: string;
  status: string;
}

export default async function MarketsPage() {
  const markets = await apiRequest<MarketRow[]>("/markets");

  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Browse live and resolved markets, then open detail pages to trade or claim payouts.</p>
      </section>
      <section className="grid">
        {markets.map((market) => (
          <Link className="panel stack" key={market.id} href={`/markets/${market.id}`}>
            <div className="muted">{market.status.toUpperCase()}</div>
            <strong>{market.title}</strong>
            <div className="muted">Market ID: {market.id.slice(0, 8)}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}
