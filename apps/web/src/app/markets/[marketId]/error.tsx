"use client";

export default function MarketDetailError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Market Detail</h1>
        <p>Could not load this market.</p>
      </section>
      <section className="error-state">Failed to load market data. Check the market ID and refresh to retry.</section>
    </main>
  );
}
