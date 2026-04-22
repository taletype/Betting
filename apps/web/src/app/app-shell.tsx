import React from "react";
import Link from "next/link";

import { getLocaleCopy, getLocaleHref, type AppLocale } from "../lib/locale";

export function AppShell({
  locale,
  children,
}: Readonly<{
  locale: AppLocale;
  children: React.ReactNode;
}>) {
  const copy = getLocaleCopy(locale);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href={getLocaleHref(locale, "/markets")}><strong>{copy.shell.brand}</strong></Link>
        <nav className="nav">
          <Link href={getLocaleHref(locale, "/markets")}>{copy.shell.nav.markets}</Link>
          <Link href={getLocaleHref(locale, "/portfolio")}>{copy.shell.nav.portfolio}</Link>
          <Link href={getLocaleHref(locale, "/referrals")}>{copy.shell.nav.referrals}</Link>
          <Link href={getLocaleHref(locale, "/claims")}>{copy.shell.nav.claims}</Link>
          <Link href={getLocaleHref(locale, "/external-markets")}>{copy.shell.nav.research}</Link>
          <Link href="/admin">{copy.shell.nav.admin}</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
