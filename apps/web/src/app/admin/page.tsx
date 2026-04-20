export default function AdminPage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Resolution, claims review, external sync status, and worker health will live here.</p>
      </section>
      <section className="grid">
        <div className="panel stack">
          <strong>Worker Status</strong>
          <div className="muted">Idempotent cron and worker jobs will report into this panel.</div>
        </div>
        <div className="panel stack">
          <strong>RLS / Audit</strong>
          <div className="muted">Supabase policy coverage and audit trail placeholders.</div>
        </div>
      </section>
    </main>
  );
}
