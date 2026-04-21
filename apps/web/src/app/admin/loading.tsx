export default function AdminLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Loading operator queues and market resolution controls…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching requested withdrawals and active market resolution actions.</div>
      </section>
    </main>
  );
}
