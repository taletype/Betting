"use client";

export default function MarketsError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Markets</h1>
        <p>Could not load markets.</p>
      </section>
      <section className="error-state">Failed to fetch market data. Refresh the page to try again.</section>
    </main>
  );
}
