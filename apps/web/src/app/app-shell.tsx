import React from "react";
import { getLocaleCopy, getLocaleHref, type AppLocale } from "../lib/locale";

export function AppShell({
  locale,
  children,
  showAdmin = false,
  authenticated = false,
}: Readonly<{
  locale: AppLocale;
  children: React.ReactNode;
  showAdmin?: boolean;
  authenticated?: boolean;
}>) {
  const copy = getLocaleCopy(locale);

  return (
    <div className="shell">
      <header className="topbar">
        <a href={getLocaleHref(locale, "/")}><strong>{copy.shell.brand}</strong></a>
        <div className="topbar-actions">
          <nav className="nav" aria-label="主導覽">
            <a href={getLocaleHref(locale, "/")}>{copy.shell.nav.home}</a>
            <a href={getLocaleHref(locale, "/polymarket")}>{copy.shell.nav.research}</a>
            <a href={getLocaleHref(locale, "/ambassador")}>{copy.shell.nav.invite}</a>
            <a href={getLocaleHref(locale, "/rewards")}>{copy.shell.nav.rewards}</a>
            <a href={getLocaleHref(locale, "/account")}>{copy.shell.nav.account}</a>
            {showAdmin ? <a href="/admin">{copy.shell.nav.admin}</a> : null}
          </nav>
          <a className="auth-state-button" href={getLocaleHref(locale, authenticated ? "/account" : "/login")}>
            {authenticated ? copy.shell.nav.account : copy.auth.login}
          </a>
        </div>
      </header>
      {children}
      <footer className="footer-disclosure">
        <span>非託管</span>
        <span>用戶自行簽署</span>
        <span>交易尚未啟用</span>
        <span>支付需人手審批</span>
      </footer>
    </div>
  );
}
