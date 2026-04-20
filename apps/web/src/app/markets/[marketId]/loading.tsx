export default function MarketDetailLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Market Detail</h1>
        <p>Loading market and realtime book…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching order book, trade history, and market metadata.</div>
      </section>
    </main>
  );
}
