"use client";

export default function ClaimsError() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Claims & Payouts</h1>
        <p>Could not load claims data.</p>
      </section>
      <section className="error-state">Failed to fetch claims and payout history. Refresh the page to try again.</section>
    </main>
  );
}
