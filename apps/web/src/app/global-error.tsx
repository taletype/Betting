"use client";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <body>
        <main className="stack">
          <section className="hero">
            <h1>Something went wrong</h1>
            <p>{error.message || "An unexpected error occurred."}</p>
          </section>
          <button type="button" className="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
