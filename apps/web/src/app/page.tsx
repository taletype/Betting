import Link from "next/link";
import React from "react";

import { MarketSparkline } from "./charts/market-charts";
import { FunnelEventTracker } from "./funnel-analytics";
import { HomeMarketImage } from "./home-market-image";
import { PendingReferralNotice } from "./pending-referral-notice";
import { BetaLaunchDisclosure, EmptyState, SharedRewardDisclosure, SharedSafetyDisclosure, StatusChip } from "./product-ui";
import { TrackedCopyButton } from "./tracked-copy-button";
import { listExternalMarkets, type ExternalMarketApiRecord } from "../lib/api";
import {
  hasExternalMarketActivity,
  hasExternalMarketPriceData,
  isExternalMarketOpenNow,
  isExternalMarketStale,
} from "../lib/external-market-status";
import { formatDateTime, defaultLocale, getLocaleHref, type AppLocale } from "../lib/locale";
import { getOriginalMarketTitle, localizeMarketTitle, localizeOutcomeLabel } from "../lib/market-localization";
import { normalizeReferralCode } from "../lib/referral-capture";
import { getSiteUrl } from "../lib/site-url";

interface HomePageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const priceOrUnavailable = (value: number | null): string =>
  value === null || value <= 0 ? "暫無價格" : value.toLocaleString(defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatMarketMoney = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString(defaultLocale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const formatOptionalDateTime = (locale: AppLocale, value: string | null | undefined): string =>
  value ? formatDateTime(locale, value, "UTC") : "—";

const sparklinePoints = (market: ExternalMarketApiRecord) =>
  market.priceHistory?.length
    ? market.priceHistory.slice(-50).map((point) => ({ timestamp: point.timestamp, value: point.price }))
    : market.recentTrades.filter((trade) => trade.price !== null).slice(0, 12).reverse().map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }));

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
      .slice(0, 4);
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
      {refCode ? (
        <div className="banner banner-success referral-banner sticky-referral">
          <strong>你正在使用推薦碼：{refCode}</strong>
          <span>登入或註冊後，如推薦碼有效，系統會保存你的推薦來源。</span>
        </div>
      ) : (
        <PendingReferralNotice
          prefix="你正在使用推薦碼："
          suffix="登入或註冊後，如推薦碼有效，系統會保存你的推薦來源。"
        />
      )}
      <section className="hero landing-hero">
        <div className="hero-copy stack">
          <h1>用一個頁面追蹤熱門 Polymarket 市場</h1>
          <p>瀏覽市場、比較價格，並在交易功能啟用後透過 Polymarket 自行簽署交易。</p>
          <div className="trust-badge-row" aria-label="平台安全披露">
            {["非託管", "用戶自行簽署", "熱門市場", "交易尚未啟用"].map((label) => (
              <StatusChip key={label}>{label}</StatusChip>
            ))}
          </div>
          <div className="market-actions">
            <Link className="button-link primary-cta" href={marketHref}>查看熱門市場</Link>
            <Link className="button-link secondary" href={getLocaleHref(locale, "/ambassador")}>邀請朋友</Link>
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
            <strong>熱門市場</strong>
            <StatusChip tone="info">Polymarket / Gamma</StatusChip>
          </div>
          {markets[0] ? (
            <>
              <div className="home-market-image-frame featured">
                <HomeMarketImage
                  imageUrl={markets[0].imageUrl}
                  iconUrl={markets[0].iconUrl}
                  alt={localizeMarketTitle(markets[0], locale)}
                  featured
                />
              </div>
              <strong>{localizeMarketTitle(markets[0], locale)}</strong>
              <div className="outcome-pill-row">
                {markets[0].outcomes.slice(0, 2).map((outcome) => (
                  <span className="outcome-pill" key={outcome.externalOutcomeId}>
                    <span>{localizeOutcomeLabel(outcome.title, locale)}</span>
                    <strong>{priceOrUnavailable(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid)}</strong>
                  </span>
                ))}
              </div>
              <MarketSparkline
                points={sparklinePoints(markets[0])}
                label="價格走勢"
                hideWhenEmpty
              />
              <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{formatMarketMoney(markets[0].volume24h ?? markets[0].volumeTotal)}</span></div>
            </>
          ) : (
            <EmptyState title="市場資料同步中">稍後可在市場頁查看開放市場。</EmptyState>
          )}
        </aside>
      </section>

      <BetaLaunchDisclosure />

      <SharedSafetyDisclosure title="安全披露" />
      <SharedRewardDisclosure />

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
              <article className="panel stack home-market-card" key={market.id}>
                <div className="home-market-image-frame">
                  <HomeMarketImage imageUrl={market.imageUrl} iconUrl={market.iconUrl} alt={localizeMarketTitle(market, locale)} />
                </div>
                <div className="market-card-meta">
                  <StatusChip tone="info">熱門市場</StatusChip>
                  <StatusChip tone="success">非託管</StatusChip>
                </div>
                <strong>{localizeMarketTitle(market, locale)}</strong>
                <div className="muted">
                  {market.outcomes.length > 0
                    ? market.outcomes.map((outcome) => localizeOutcomeLabel(outcome.title, locale)).join(" / ")
                    : "結果資料同步中"}
                </div>
                <div className="outcome-pill-row">
                  {market.outcomes.slice(0, 3).map((outcome) => (
                    <span className="outcome-pill" key={outcome.externalOutcomeId}>
                      <span>{localizeOutcomeLabel(outcome.title, locale)}</span>
                      <strong>{priceOrUnavailable(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid)}</strong>
                    </span>
                  ))}
                </div>
                <MarketSparkline
                  points={sparklinePoints(market)}
                  label="價格走勢"
                  hideWhenEmpty
                />
                <div className="kv"><span className="kv-key">成交量</span><span className="kv-value">{formatMarketMoney(market.volume24h ?? market.volumeTotal)}</span></div>
                <div className="kv"><span className="kv-key">流動性</span><span className="kv-value">{formatMarketMoney(market.liquidity ?? null)}</span></div>
                <div className="kv"><span className="kv-key">收市時間</span><span className="kv-value">{formatOptionalDateTime(locale, market.closeTime)}</span></div>
                <div className="kv"><span className="kv-key">來源</span><span className="kv-value">Polymarket / Gamma</span></div>
                {getOriginalMarketTitle(market) && getOriginalMarketTitle(market) !== localizeMarketTitle(market, locale) ? <div className="muted">原文：{getOriginalMarketTitle(market)}</div> : null}
                <div className="muted">最後更新：{formatOptionalDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt)}</div>
                <Link className="button-link secondary" href={`${getLocaleHref(locale, `/polymarket/${encodeURIComponent(market.slug || market.externalId)}`)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>
                  查看市場
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
            <article className="panel stack visual-step-card" key={item}>
              <StatusChip>0{index + 1}</StatusChip>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">安全說明</h2>
        <div className="panel stack">
          <p>本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。</p>
          <p>交易功能只會在錢包、Polymarket 憑證、Builder Code 及提交流程準備好後啟用。</p>
        </div>
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">Ambassador</h2>
        <div className="panel stack invite-link-card">
          <p>分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。</p>
          <Link className="button-link secondary" href={getLocaleHref(locale, "/ambassador")}>取得推薦連結</Link>
        </div>
      </section>
    </main>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  return renderHomePage(defaultLocale, searchParams);
}
