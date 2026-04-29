export default function PortfolioLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Loading balances, positions, and transfer history…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching Base wallet, deposits, withdrawals, and claim states.</div>
      </section>
    </main>
  );
}
