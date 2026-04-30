import React from "react";
import { getLocaleCopy, getLocaleHref, type AppLocale } from "../lib/locale";
import { siteCopy } from "../lib/i18n";
import { getPublicBetaLaunchState } from "../lib/launch-mode";
import { LanguageSwitcher } from "./language-switcher";

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
  const shortCopy = siteCopy[locale];
  const launch = getPublicBetaLaunchState();
  const navItems = [
    { href: "/", label: copy.shell.nav.home, mobileLabel: "首頁", showMobile: true },
    { href: "/polymarket", label: copy.shell.nav.research, mobileLabel: "市場", showMobile: true },
    { href: "/ambassador", label: copy.shell.nav.invite, mobileLabel: "邀請", showMobile: true },
    { href: "/rewards", label: copy.shell.nav.rewards, mobileLabel: "獎勵", showMobile: true },
    { href: "/account", label: copy.shell.nav.account, mobileLabel: "帳戶", showMobile: true },
    ...(showAdmin ? [{ href: "/admin", label: copy.shell.nav.admin, mobileLabel: "管理", showMobile: true }] : []),
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand-link" href={getLocaleHref(locale, "/")}><strong>{copy.shell.brand}</strong></a>
        <div className="topbar-actions">
          <nav className="nav desktop-nav" aria-label="主導覽">
            {navItems.map((item) => (
              <a key={item.href} href={item.href === "/admin" ? item.href : getLocaleHref(locale, item.href)}>{item.label}</a>
            ))}
          </nav>
          <a className="auth-state-button" href={getLocaleHref(locale, authenticated ? "/account" : "/login")}>
            {authenticated ? copy.shell.nav.account : copy.auth.login}
          </a>
          <LanguageSwitcher currentLocale={locale} />
        </div>
      </header>
      <nav className="mobile-nav" aria-label="主導覽">
        {navItems.filter((item) => item.showMobile).map((item) => (
          <a key={item.href} href={item.href === "/admin" ? item.href : getLocaleHref(locale, item.href)}>{item.mobileLabel}</a>
        ))}
      </nav>
      {children}
      <footer className="footer-disclosure">
        <span>{launch.isBeta ? "Beta 公開預覽" : "正式模式"}</span>
        <span>{shortCopy.nonCustodial}</span>
        <span>{shortCopy.userSignedOrder}</span>
        <span>{copy.research.disabled}</span>
        <span>{locale === "zh-HK" ? "支付需人手審批" : shortCopy.manualApproval}</span>
      </footer>
    </div>
  );
}
