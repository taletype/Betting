"use client";

export default function AdminError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Admin</h1>
        <p>Could not load admin data.</p>
      </section>
      <section className="error-state">Failed to fetch withdrawal queue or market list. Refresh to retry.</section>
    </main>
  );
}
