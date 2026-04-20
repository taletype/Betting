import Link from "next/link";

const markets = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Will the Fed cut rates before year end?",
    status: "Open",
    price: "54",
    volume: "128900",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Will ETH ETF net inflows stay positive this month?",
    status: "Open",
    price: "61",
    volume: "88200",
  },
];

export default function MarketsPage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>
          Integer-priced prediction markets, append-only ledger accounting, and worker-driven state
          transitions. This page is scaffolded to compile cleanly while backend modules fill in.
        </p>
      </section>
      <section className="grid">
        {markets.map((market) => (
          <Link className="panel stack" key={market.id} href={`/markets/${market.id}`}>
            <div className="muted">{market.status}</div>
            <strong>{market.title}</strong>
            <div className="grid">
              <div>
                <div className="muted">Mid price</div>
                <div className="metric">{market.price}</div>
              </div>
              <div>
                <div className="muted">Volume</div>
                <div className="metric">{market.volume}</div>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
