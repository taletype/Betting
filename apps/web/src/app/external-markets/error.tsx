"use client";

export default function ExternalMarketsError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>External Markets</h1>
        <p>Could not load external markets.</p>
      </section>
      <section className="error-state">Failed to load synced external markets. Refresh to retry.</section>
    </main>
  );
}
