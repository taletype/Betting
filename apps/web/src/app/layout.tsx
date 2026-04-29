import type { Metadata } from "next";
import { AppShell } from "./app-shell";
import { ReferralCapture } from "./referral-capture";
import { defaultLocale } from "../lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet",
  description: "非託管 Polymarket Builder routing scaffold",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={defaultLocale}>
      <body>
        <ReferralCapture />
        <AppShell locale={defaultLocale}>{children}</AppShell>
      </body>
    </html>
  );
}
