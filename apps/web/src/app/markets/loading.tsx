export default function MarketsLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Loading market list…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching latest market snapshots and pricing.</div>
      </section>
    </main>
  );
}
