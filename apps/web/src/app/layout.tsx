import type { Metadata } from "next";
import Link from "next/link";
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
        <div className="shell">
          <header className="topbar">
            <Link href="/markets"><strong>Bet</strong></Link>
            <nav className="nav">
              <Link href="/markets">Markets</Link>
              <Link href="/portfolio">Portfolio</Link>
              <Link href="/external-markets">External</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
