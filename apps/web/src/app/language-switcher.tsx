"use client";

import React from "react";

import {
  defaultLocale,
  localeCookieName,
  localeToDisplayName,
  localeToPathSegment,
  pathSegmentToLocale,
  supportedLocales,
  type AppLocale,
} from "../lib/locale";

const stripLocalePrefix = (pathname: string): string => {
  const segments = pathname.split("/").filter(Boolean);
  if (pathSegmentToLocale(segments[0])) {
    return `/${segments.slice(1).join("/")}`;
  }
  return pathname || "/";
};

const withLocalePrefix = (locale: AppLocale, pathname: string): string => {
  const stripped = stripLocalePrefix(pathname);
  if (locale === defaultLocale) return stripped || "/";
  return stripped === "/" ? `/${localeToPathSegment(locale)}` : `/${localeToPathSegment(locale)}${stripped}`;
};

export function LanguageSwitcher({ currentLocale }: { currentLocale: AppLocale }) {
  return (
    <nav className="locale-switcher" aria-label="Language">
      {supportedLocales.map((locale) => {
        const href = withLocalePrefix(locale, "/");
        return (
          <a
            key={locale}
            href={href}
            aria-current={locale === currentLocale ? "true" : undefined}
            onClick={(event) => {
              document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;
              window.localStorage.setItem(localeCookieName, locale);
              const query = window.location.search.replace(/^\?/, "");
              const nextHref = `${withLocalePrefix(locale, window.location.pathname || "/")}${query ? `?${query}` : ""}`;
              event.preventDefault();
              window.location.assign(nextHref);
            }}
          >
            {localeToDisplayName(locale)}
          </a>
        );
      })}
    </nav>
  );
}
