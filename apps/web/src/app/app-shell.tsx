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
  currentPath = "/",
}: Readonly<{
  locale: AppLocale;
  children: React.ReactNode;
  showAdmin?: boolean;
  authenticated?: boolean;
  currentPath?: string;
}>) {
  const copy = getLocaleCopy(locale);
  const shortCopy = siteCopy[locale];
  const launch = getPublicBetaLaunchState();
  const footerSafety =
    locale === "en"
      ? shortCopy.safety
      : locale === "zh-CN"
        ? shortCopy.safety
        : "本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。";
  const footerReward =
    locale === "en"
      ? "Rewards can be recorded automatically, but actual payouts require admin approval."
      : locale === "zh-CN"
        ? "奖励计算可自动记录，但实际支付需要管理员人工审核。"
        : "獎勵計算可自動記錄，但實際支付需要管理員審批。";
  const navItems = [
    { href: "/", label: copy.shell.nav.home, mobileLabel: copy.shell.nav.home, showMobile: true },
    { href: "/polymarket", label: copy.shell.nav.research, mobileLabel: copy.shell.nav.markets, showMobile: true },
    { href: "/ambassador", label: copy.shell.nav.invite, mobileLabel: copy.shell.nav.invite, showMobile: true },
    { href: "/rewards", label: copy.shell.nav.rewards, mobileLabel: copy.shell.nav.rewards, showMobile: true },
    { href: "/guides", label: copy.shell.nav.guides, mobileLabel: copy.shell.nav.guides, showMobile: true },
    { href: "/account", label: copy.shell.nav.account, mobileLabel: copy.shell.nav.account, showMobile: true },
    ...(showAdmin ? [{ href: "/admin", label: copy.shell.nav.admin, mobileLabel: copy.shell.nav.admin, showMobile: true }] : []),
  ];
  const normalizedPath = currentPath === "/" ? "/" : currentPath.replace(/^\/(zh-hk|zh-cn|en)(?=\/|$)/i, "") || "/";
  const isActive = (href: string): boolean => href === "/" ? normalizedPath === "/" : normalizedPath === href || normalizedPath.startsWith(`${href}/`);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand-link" href={getLocaleHref(locale, "/")}><strong>{copy.shell.brand}</strong></a>
        <div className="topbar-actions">
          <nav className="nav desktop-nav" aria-label="主導覽">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  className={active ? "active" : undefined}
                  aria-current={active ? "page" : undefined}
                  href={item.href === "/admin" ? item.href : getLocaleHref(locale, item.href)}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <a className="auth-state-button" href={getLocaleHref(locale, authenticated ? "/account" : "/login")}>
            {authenticated ? copy.shell.nav.account : copy.auth.login}
          </a>
          <LanguageSwitcher currentLocale={locale} />
        </div>
      </header>
      <nav className="mobile-nav" aria-label="主導覽">
        {navItems.filter((item) => item.showMobile).map((item) => {
          const active = isActive(item.href);
          return (
            <a
              key={item.href}
              className={active ? "active" : undefined}
              aria-current={active ? "page" : undefined}
              href={item.href === "/admin" ? item.href : getLocaleHref(locale, item.href)}
            >
              {item.mobileLabel}
            </a>
          );
        })}
      </nav>
      {children}
      <footer className="footer-disclosure">
        <span>{launch.isBeta ? (locale === "en" ? "Public beta preview" : locale === "zh-CN" ? "Beta 公开预览" : "Beta 公開預覽") : (locale === "en" ? "Production mode" : "正式模式")}</span>
        <span>{shortCopy.nonCustodial}</span>
        <span>{shortCopy.userSignedOrder}</span>
        <span>{copy.research.disabled}</span>
        <span>{footerSafety}</span>
        <span>{footerReward}</span>
      </footer>
    </div>
  );
}
