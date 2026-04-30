import Link from "next/link";
import React from "react";

import { MarketSparkline } from "./charts/market-charts";
import { FunnelEventTracker } from "./funnel-analytics";
import { PendingReferralNotice } from "./pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, SafetyDisclosure, StatusChip } from "./product-ui";
import { TrackedCopyButton } from "./tracked-copy-button";
import { listExternalMarkets, type ExternalMarketApiRecord } from "../lib/api";
import {
  hasExternalMarketActivity,
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "../lib/external-market-status";
import { formatDateTime, defaultLocale, getLocaleHref, type AppLocale } from "../lib/locale";
import { normalizeReferralCode } from "../lib/referral-capture";
import { getSiteUrl } from "../lib/site-url";

interface HomePageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const numberOrDash = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString(defaultLocale, { maximumFractionDigits: 2 });

const priceOrUnavailable = (value: number | null): string =>
  value === null || value <= 0 ? "暫無價格" : value.toLocaleString(defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getTrendingMarkets = async (locale: AppLocale): Promise<ExternalMarketApiRecord[]> => {
  try {
    return [...(await listExternalMarkets(locale, "open")).filter((market) =>
      market.source === "polymarket" &&
      isExternalMarketOpenNow(market) &&
      !isExternalMarketStale(market) &&
      hasExternalMarketActivity(market) &&
      hasExternalMarketPriceData(market)
    )]
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
  const marketHref = `${getLocaleHref(locale, "/polymarket")}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
  const inviteUrl = refCode ? `${getSiteUrl()}/?ref=${encodeURIComponent(refCode)}` : getSiteUrl();

  return (
    <main className="stack">
      <FunnelEventTracker name="landing_page_view" metadata={refCode ? { ref: refCode } : undefined} />
      {refCode ? <FunnelEventTracker name="referral_code_seen" metadata={{ code: refCode }} /> : null}
      {refCode ? <div className="banner banner-success referral-banner sticky-referral">你正在使用推薦碼：{refCode}。市場連結會保留直接推薦歸因。</div> : null}
      <section className="hero landing-hero">
        <div className="hero-copy stack">
          <h1>繁中 Polymarket 市場入口</h1>
          <span className="sr-only">用一個頁面追蹤熱門 Polymarket 市場</span>
          <p>以繁體中文瀏覽市場、比較價格、分享有用市場連結，並清楚查看推薦獎勵及 Beta 交易狀態。</p>
          {!refCode ? <PendingReferralNotice /> : null}
          <div className="trust-badge-row" aria-label="平台安全披露">
            {["Beta", "非託管", "交易尚未啟用", "直接推薦", "人手審批"].map((label) => (
              <StatusChip key={label}>{label}</StatusChip>
            ))}
          </div>
          <div className="market-actions">
            <Link className="button-link primary-cta" href={marketHref}>前往 Polymarket 市場</Link>
            <Link className="button-link secondary" href={getLocaleHref(locale, "/ambassador")}>查看邀請獎勵</Link>
            <TrackedCopyButton
              value={inviteUrl}
              label="複製邀請連結"
              copiedLabel="已複製"
              eventName="invite_link_copied"
              metadata={refCode ? { code: refCode, surface: "home" } : { surface: "home" }}
            />
          </div>
        </div>
        <aside className="hero-market-preview panel stack" aria-label="熱門市場預覽">
          <div className="section-heading-row">
            <strong>市場探索</strong>
            <StatusChip tone="info">Polymarket</StatusChip>
          </div>
          {markets[0] ? (
            <>
              <strong>{markets[0].title}</strong>
              <div className="outcome-pill-row">
                {markets[0].outcomes.slice(0, 2).map((outcome) => (
                  <span className="outcome-pill" key={outcome.externalOutcomeId}>
                    <span>{outcome.title}</span>
                    <strong>{priceOrUnavailable(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid)}</strong>
                  </span>
                ))}
              </div>
              <MarketSparkline
                points={markets[0].recentTrades.filter((trade) => trade.price !== null).slice(0, 12).reverse().map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }))}
                label="價格走勢"
              />
              <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{numberOrDash(markets[0].volume24h ?? markets[0].volumeTotal)}</span></div>
            </>
          ) : (
            <EmptyState title="市場資料同步中">稍後可在市場頁查看開放市場。</EmptyState>
          )}
        </aside>
      </section>

      <BetaLaunchDisclosure />

      <SafetyDisclosure title="安全披露">
        本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。
      </SafetyDisclosure>

      <section className="stack">
        <div className="section-heading-row">
          <h2 className="section-title">熱門 Polymarket 市場</h2>
          <Link href={marketHref}>查看全部</Link>
        </div>
        {markets.length === 0 ? (
          <EmptyState title="暫時未有符合條件的開放市場。"><span className="sr-only">暫時未有活躍市場資料</span>市場資料可能已過期，請稍後再試。</EmptyState>
        ) : (
          <div className="grid">
            {markets.map((market) => (
              <article className="panel stack" key={market.id}>
                <div className="market-card-meta">
                  <StatusChip tone="info">Polymarket</StatusChip>
                  <StatusChip tone="success">開放</StatusChip>
                </div>
                <strong>{market.title}</strong>
                <div className="muted">
                  {market.outcomes.length > 0
                    ? market.outcomes.map((outcome) => outcome.title).join(" / ")
                    : "結果資料同步中"}
                </div>
                <div className="kv"><span className="kv-key">價格</span><span className="kv-value">{priceOrUnavailable(market.lastTradePrice)}</span></div>
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
          {["瀏覽市場", "分享連結", "用戶自行簽署", "合資格交易可產生獎勵"].map((item, index) => (
            <article className="panel stack" key={item}>
              <StatusChip>0{index + 1}</StatusChip>
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
