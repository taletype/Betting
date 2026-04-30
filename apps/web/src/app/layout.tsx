import type { Metadata } from "next";
import { AppShell } from "./app-shell";
import { getCurrentWebUser } from "./auth-session";
import { ReferralCapture } from "./referral-capture";
import { OptionalThirdwebProvider } from "./thirdweb-provider";
import { defaultLocale } from "../lib/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet",
  description: "非託管 Polymarket Builder routing scaffold",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentWebUser();
  const showAdmin = user?.role === "admin" || user?.role === "operator";

  return (
    <html lang={defaultLocale}>
      <body>
        <ReferralCapture />
        <OptionalThirdwebProvider>
          <AppShell locale={defaultLocale} showAdmin={showAdmin} authenticated={Boolean(user)}>{children}</AppShell>
        </OptionalThirdwebProvider>
      </body>
    </html>
  );
}
