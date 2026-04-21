export default function ExternalMarketsLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>External Markets</h1>
        <p>Loading synced external market snapshots…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching Polymarket and Kalshi outcomes, prices, and recent trade ticks.</div>
      </section>
    </main>
  );
}
