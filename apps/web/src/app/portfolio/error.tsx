"use client";

export default function PortfolioError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Portfolio</h1>
        <p>Could not load portfolio data.</p>
      </section>
      <section className="error-state">Failed to fetch portfolio data. Refresh the page to try again.</section>
    </main>
  );
}
