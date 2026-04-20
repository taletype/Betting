export default function PortfolioLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Loading portfolio data…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching balances, positions, orders, and transfer history.</div>
      </section>
    </main>
  );
}
