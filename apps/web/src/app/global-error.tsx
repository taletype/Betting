"use client";

import { resolveLocale } from "../lib/locale";

export default function GlobalError({
  error,
  reset,
  params,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
  params?: { locale?: string };
}>) {
  const locale = resolveLocale(params?.locale);
  const title = locale === "zh-HK" ? "發生錯誤" : "Something went wrong";
  const retry = locale === "zh-HK" ? "重試" : "Try again";
  const fallback = locale === "zh-HK" ? "發生未預期錯誤。" : "An unexpected error occurred.";
  return (
    <html lang={locale}>
      <body>
        <main className="stack">
          <section className="hero">
            <h1>{title}</h1>
            <p>{error.message || fallback}</p>
          </section>
          <button type="button" className="button" onClick={() => reset()}>
            {retry}
          </button>
        </main>
      </body>
    </html>
  );
}
