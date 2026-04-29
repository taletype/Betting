import React from "react";
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
        <a href={getLocaleHref(locale, "/markets")}><strong>{copy.shell.brand}</strong></a>
        <nav className="nav">
          <a href={getLocaleHref(locale, "/markets")}>{copy.shell.nav.markets}</a>
          <a href={getLocaleHref(locale, "/portfolio")}>{copy.shell.nav.portfolio}</a>
          <a href={getLocaleHref(locale, "/ambassador")}>{copy.shell.nav.ambassador}</a>
          <a href={getLocaleHref(locale, "/rewards")}>{copy.shell.nav.rewards}</a>
          <a href={getLocaleHref(locale, "/claims")}>{copy.shell.nav.claims}</a>
          <a href={getLocaleHref(locale, "/external-markets")}>{copy.shell.nav.research}</a>
          <a href={getLocaleHref(locale, "/account")}>{copy.shell.nav.account}</a>
          <a href="/admin">{copy.shell.nav.admin}</a>
        </nav>
      </header>
      {children}
    </div>
  );
}
