import type { Metadata } from "next";
import { headers } from "next/headers";

import { AppShell } from "./app-shell";
import { localeHeaderName, resolveLocale } from "../lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet",
  description: "Prediction market scaffold",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const headerStore = await headers();
  const locale = resolveLocale(headerStore.get(localeHeaderName));

  return (
    <html lang={locale}>
      <body>
        <AppShell locale={locale}>{children}</AppShell>
      </body>
    </html>
  );
}
