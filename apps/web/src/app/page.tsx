import Link from "next/link";
import React from "react";

import { BuilderFeeDisclosureCard } from "./builder-fee-disclosure-card";
import { FunnelEventTracker } from "./funnel-analytics";
import { PendingReferralNotice } from "./pending-referral-notice";
import { TrackedCopyButton } from "./tracked-copy-button";
import { listExternalMarkets, type ExternalMarketApiRecord } from "../lib/api";
import { formatDateTime, defaultLocale } from "../lib/locale";
import { normalizeReferralCode } from "../lib/referral-capture";

interface HomePageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const numberOrDash = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString(defaultLocale, { maximumFractionDigits: 2 });

const getTrendingMarkets = async (): Promise<ExternalMarketApiRecord[]> => {
  try {
    return [...(await listExternalMarkets()).filter((market) => market.source === "polymarket")]
      .sort((a: ExternalMarketApiRecord, b: ExternalMarketApiRecord) =>
        (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0)
      )
      .slice(0, 3);
  } catch (error) {
    console.warn("landing page Polymarket preview unavailable", error);
    return [];
  }
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const refCode = normalizeReferralCode(params?.ref);
  const markets = await getTrendingMarkets();
  const inviteUrl = refCode ? `${siteUrl()}/?ref=${encodeURIComponent(refCode)}` : siteUrl();
  const marketHref = refCode ? `/polymarket?ref=${encodeURIComponent(refCode)}` : "/polymarket";

  return (
    <main className="stack">
      <FunnelEventTracker name="landing_page_view" metadata={refCode ? { ref: refCode } : undefined} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero landing-hero">
        <div className="stack">
          <h1>用一個頁面追蹤熱門 Polymarket 市場</h1>
          <p>瀏覽市場、比較價格，並在交易功能啟用後透過 Polymarket 自行簽署交易。</p>
          {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
          <div className="market-actions">
            <Link className="button-link" href={marketHref}>查看熱門市場</Link>
            <TrackedCopyButton
              value={inviteUrl}
              label="複製邀請連結"
              copiedLabel="已複製"
              eventName="invite_link_copied"
              metadata={refCode ? { code: refCode } : undefined}
            />
            <TrackedCopyButton
              value={`${siteUrl()}${marketHref}`}
              label="複製市場推薦連結"
              copiedLabel="已複製"
              eventName="market_share_link_copied"
              metadata={refCode ? { code: refCode, surface: "home" } : { surface: "home" }}
            />
          </div>
          <p className="muted">本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。</p>
        </div>
      </section>

      <BuilderFeeDisclosureCard locale={defaultLocale} />

      <section className="stack">
        <div className="section-heading-row">
          <h2 className="section-title">熱門 Polymarket 市場</h2>
          <Link href={marketHref}>查看全部</Link>
        </div>
        {markets.length === 0 ? (
          <div className="panel empty-state">市場資料暫時未能更新</div>
        ) : (
          <div className="grid">
            {markets.map((market) => (
              <article className="panel stack" key={market.id}>
                <div className="badge badge-neutral">polymarket</div>
                <strong>{market.title}</strong>
                <div className="muted">
                  {market.outcomes.length > 0
                    ? market.outcomes.map((outcome) => outcome.title).join(" / ")
                    : "結果資料同步中"}
                </div>
                <div className="kv"><span className="kv-key">價格</span><span className="kv-value">{numberOrDash(market.lastTradePrice)}</span></div>
                <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{numberOrDash(market.volume24h ?? market.volumeTotal)}</span></div>
                <div className="muted">更新：{market.lastSyncedAt ? formatDateTime(defaultLocale, market.lastSyncedAt, "UTC") : "—"}</div>
                <Link href={`/polymarket/${encodeURIComponent(market.slug || market.externalId)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>
                  市場詳情
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
