import type { Metadata } from "next";
import { AppShell } from "./app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet",
  description: "Prediction market scaffold",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell locale="en">{children}</AppShell>
      </body>
    </html>
  );
}
