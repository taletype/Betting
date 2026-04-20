export default function PortfolioPage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Balances, positions, and claims stay ledger-derived. Nothing here uses floating-point math.</p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>USD Balance</strong>
          <div className="metric">100000</div>
          <div className="muted">Available cents-equivalent units.</div>
        </div>
        <div className="panel stack">
          <strong>Reserved</strong>
          <div className="metric">0</div>
          <div className="muted">Held for open orders.</div>
        </div>
      </section>
    </main>
  );
}
