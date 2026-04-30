import Link from "next/link";
import React from "react";

import { BuilderFeeDisclosureCard } from "./builder-fee-disclosure-card";
import { MarketSparkline } from "./charts/market-charts";
import { FunnelEventTracker } from "./funnel-analytics";
import { PendingReferralNotice } from "./pending-referral-notice";
import { TrackedCopyButton } from "./tracked-copy-button";
import { listExternalMarkets, type ExternalMarketApiRecord } from "../lib/api";
import { formatDateTime, defaultLocale, getLocaleHref, type AppLocale } from "../lib/locale";
import { normalizeReferralCode } from "../lib/referral-capture";

interface HomePageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const numberOrDash = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString(defaultLocale, { maximumFractionDigits: 2 });

const getTrendingMarkets = async (locale: AppLocale): Promise<ExternalMarketApiRecord[]> => {
  try {
    return [...(await listExternalMarkets(locale)).filter((market) => market.source === "polymarket")]
      .sort((a: ExternalMarketApiRecord, b: ExternalMarketApiRecord) =>
        (b.volume24h ?? b.volumeTotal ?? 0) - (a.volume24h ?? a.volumeTotal ?? 0)
      )
      .slice(0, 3);
  } catch (error) {
    console.warn("landing page Polymarket preview unavailable", error);
    return [];
  }
};

export async function renderHomePage(locale: AppLocale, searchParams?: HomePageProps["searchParams"]) {
  const params = await searchParams;
  const refCode = normalizeReferralCode(params?.ref);
  const markets = await getTrendingMarkets(locale);
  const inviteUrl = refCode ? `${siteUrl()}/?ref=${encodeURIComponent(refCode)}` : siteUrl();
  const marketHref = `${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;

  return (
    <main className="stack">
      <FunnelEventTracker name="landing_page_view" metadata={refCode ? { ref: refCode } : undefined} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      <section className="hero landing-hero">
        <div className="stack">
          <h1>用一個頁面追蹤熱門 Polymarket 市場</h1>
          <p>瀏覽市場、比較價格，並在交易功能啟用後透過 Polymarket 自行簽署交易。</p>
          {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
          <div className="trust-badge-row" aria-label="平台安全披露">
            {["非託管", "用戶自行簽署", "Polymarket 市場資料", "Builder Code 已設定", "支付需人手審批"].map((label) => (
              <span className="badge badge-neutral" key={label}>{label}</span>
            ))}
          </div>
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
          <p className="muted">本平台顯示 Polymarket 市場資料。用戶需要自行連接錢包及簽署交易。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。</p>
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
                <MarketSparkline
                  points={market.recentTrades.filter((trade) => trade.price !== null).slice(0, 12).reverse().map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }))}
                  label="價格走勢"
                />
                <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{numberOrDash(market.volume24h ?? market.volumeTotal)}</span></div>
                {market.titleOriginal && market.titleOriginal !== market.title ? <div className="muted">原文：{market.titleOriginal}</div> : null}
                <div className="muted">更新：{market.lastSyncedAt ? formatDateTime(locale, market.lastSyncedAt, "UTC") : "—"}</div>
                <Link className="button-link secondary" href={`${getLocaleHref(locale, `/polymarket/${encodeURIComponent(market.slug || market.externalId)}`)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>
                  市場詳情
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">如何運作</h2>
        <div className="grid">
          {["瀏覽 Polymarket 市場", "連接錢包", "用戶自行簽署訂單", "合資格交易可產生 Builder 費用收入"].map((item, index) => (
            <article className="panel stack" key={item}>
              <span className="badge badge-neutral">0{index + 1}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  return renderHomePage(defaultLocale, searchParams);
}
