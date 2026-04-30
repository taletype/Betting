import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "./app-shell";
import { getCurrentWebUser } from "./auth-session";
import { ReferralCapture } from "./referral-capture";
import { OptionalThirdwebProvider } from "./thirdweb-provider";
import { defaultLocale, localeHeaderName, localeToHtmlLang, normalizeLocale } from "../lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bet — 中文 Polymarket 市場追蹤與推薦工具",
    template: "%s | Bet",
  },
  description: "非託管 Polymarket 市場追蹤與推薦工具。交易保持用戶自行簽署，支付需要管理員審批。",
  alternates: {
    canonical: "/",
    languages: {
      "zh-HK": "/",
      "zh-TW": "/zh-tw",
      "zh-CN": "/zh-cn",
      en: "/en",
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentWebUser();
  const showAdmin = user?.role === "admin";
  const requestHeaders = await headers();
  const locale = normalizeLocale(requestHeaders.get(localeHeaderName) ?? defaultLocale);

  return (
    <html lang={localeToHtmlLang(locale)}>
      <body>
        <ReferralCapture />
        <OptionalThirdwebProvider>
          <AppShell locale={locale} showAdmin={showAdmin} authenticated={Boolean(user)}>{children}</AppShell>
        </OptionalThirdwebProvider>
      </body>
    </html>
  );
}
