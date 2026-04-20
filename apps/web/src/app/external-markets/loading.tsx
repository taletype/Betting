export default function ExternalMarketsLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>External Markets</h1>
        <p>Loading external market snapshots…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching synced market data from external providers.</div>
      </section>
    </main>
  );
}
