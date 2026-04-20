export default function PortfolioLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Loading balances and transfer history…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching wallet balances, deposits, and withdrawals.</div>
      </section>
    </main>
  );
}
