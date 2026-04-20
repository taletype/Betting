interface MarketDetailPageProps {
  params: Promise<{ marketId: string }>;
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { marketId } = await params;

  return (
    <main className="stack">
      <section className="hero">
        <h1>Market {marketId.slice(0, 8)}</h1>
        <p>
          Scaffold detail page for order entry, order book, trades, charting, and resolution notes.
          Matching and portfolio updates remain worker-backed TODOs.
        </p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>Order Entry</strong>
          <div className="muted">Limit and market order form placeholder.</div>
        </div>
        <div className="panel stack">
          <strong>Order Book</strong>
          <div className="muted">Deterministic matching output will render here.</div>
        </div>
        <div className="panel stack">
          <strong>Recent Trades</strong>
          <div className="muted">Execution tape placeholder.</div>
        </div>
      </section>
    </main>
  );
}
