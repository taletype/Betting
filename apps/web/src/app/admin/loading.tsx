export default function AdminLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Loading admin data…</p>
      </section>
      <section className="panel">
        <div className="empty-state">Fetching withdrawal requests and market resolution data.</div>
      </section>
    </main>
  );
}
