export default function ClaimsLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Claims & Payouts</h1>
        <p>Loading claim and payout history…</p>
      </section>
      <section className="panel empty-state">Fetching resolved-market claim records and totals.</section>
    </main>
  );
}
