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

const homeCopy: Record<AppLocale, {
  priceUnavailable: string;
  referralPrefix: string;
  referralSuffix: string;
  heroTitle: string;
  heroBody: string;
  safetyAria: string;
  badges: string[];
  viewTrending: string;
  inviteFriends: string;
  copyInvite: string;
  copied: string;
  previewAria: string;
  trendingMarkets: string;
  sourceLabel: string;
  priceTrend: string;
  volume: string;
  marketSyncingTitle: string;
  marketSyncingBody: string;
  safetyTitle: string;
  trendingSection: string;
  viewAll: string;
  emptyTitle: string;
  emptySr: string;
  emptyBody: string;
  noOutcomes: string;
  nonCustodial: string;
  liquidity: string;
  closeTime: string;
  source: string;
  original: string;
  lastUpdated: string;
  viewMarket: string;
  howItWorks: string;
  steps: string[];
  safetySection: string;
  safetyBodyOne: string;
  safetyBodyTwo: string;
  ambassadorTitle: string;
  ambassadorBody: string;
  getReferralLink: string;
}> = {
  en: {
    priceUnavailable: "No price",
    referralPrefix: "You are using referral code: ",
    referralSuffix: "After login or sign-up, the system will save your referral source if the code is valid.",
    heroTitle: "Track trending Polymarket markets from one page",
    heroBody: "Browse markets, compare prices, and sign your own Polymarket trades when trading is enabled.",
    safetyAria: "Platform safety disclosures",
    badges: ["Non-custodial", "User-signed orders", "Trending markets", "Trading not enabled"],
    viewTrending: "View trending markets",
    inviteFriends: "Invite friends",
    copyInvite: "Copy invite link",
    copied: "Copied",
    previewAria: "Trending market preview",
    trendingMarkets: "Trending markets",
    sourceLabel: "Polymarket / Gamma",
    priceTrend: "Price trend",
    volume: "Volume",
    marketSyncingTitle: "Market data syncing",
    marketSyncingBody: "Open markets will be available on the market page shortly.",
    safetyTitle: "Safety disclosure",
    trendingSection: "Trending Polymarket markets",
    viewAll: "View all",
    emptyTitle: "No eligible open markets right now.",
    emptySr: "No active market data right now",
    emptyBody: "Market data may be stale. Please try again later.",
    noOutcomes: "Outcome data syncing",
    nonCustodial: "Non-custodial",
    liquidity: "Liquidity",
    closeTime: "Close time",
    source: "Source",
    original: "Original: ",
    lastUpdated: "Last updated: ",
    viewMarket: "View market",
    howItWorks: "How it works",
    steps: ["Browse Polymarket markets", "Connect wallet", "Sign your own orders", "Eligible trades can generate Builder-fee revenue"],
    safetySection: "Safety notes",
    safetyBodyOne: "The platform does not trade or bet for users and does not custody user Polymarket funds.",
    safetyBodyTwo: "Trading only turns on after wallet, Polymarket credential, Builder Code, and submission checks are ready.",
    ambassadorTitle: "Ambassador",
    ambassadorBody: "Share market links. When a user you directly referred completes an eligible trade through this platform and confirmed Builder-fee revenue is generated, you can earn referral rewards.",
    getReferralLink: "Get referral link",
  },
  "zh-HK": {
    priceUnavailable: "暫無價格",
    referralPrefix: "你正在使用推薦碼：",
    referralSuffix: "登入或註冊後，如推薦碼有效，系統會保存你的推薦來源。",
    heroTitle: "用一個頁面追蹤熱門 Polymarket 市場",
    heroBody: "瀏覽市場、比較價格，並在交易功能啟用後透過 Polymarket 自行簽署交易。",
    safetyAria: "平台安全披露",
    badges: ["非託管", "用戶自行簽署", "熱門市場", "交易尚未啟用"],
    viewTrending: "查看熱門市場",
    inviteFriends: "邀請朋友",
    copyInvite: "複製邀請連結",
    copied: "已複製",
    previewAria: "熱門市場預覽",
    trendingMarkets: "熱門市場",
    sourceLabel: "Polymarket / Gamma",
    priceTrend: "價格走勢",
    volume: "成交量",
    marketSyncingTitle: "市場資料同步中",
    marketSyncingBody: "稍後可在市場頁查看開放市場。",
    safetyTitle: "安全披露",
    trendingSection: "熱門 Polymarket 市場",
    viewAll: "查看全部",
    emptyTitle: "暫時未有符合條件的開放市場。",
    emptySr: "暫時未有活躍市場資料",
    emptyBody: "市場資料可能已過期，請稍後再試。",
    noOutcomes: "結果資料同步中",
    nonCustodial: "非託管",
    liquidity: "流動性",
    closeTime: "收市時間",
    source: "來源",
    original: "原文：",
    lastUpdated: "最後更新：",
    viewMarket: "查看市場",
    howItWorks: "如何運作",
    steps: ["瀏覽 Polymarket 市場", "連接錢包", "用戶自行簽署訂單", "合資格交易可產生 Builder 費用收入"],
    safetySection: "安全說明",
    safetyBodyOne: "本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。",
    safetyBodyTwo: "交易功能只會在錢包、Polymarket 憑證、Builder Code 及提交流程準備好後啟用。",
    ambassadorTitle: "Ambassador",
    ambassadorBody: "分享市場連結。當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。",
    getReferralLink: "取得推薦連結",
  },
  "zh-CN": {
    priceUnavailable: "暂无价格",
    referralPrefix: "你正在使用推荐码：",
    referralSuffix: "登录或注册后，如推荐码有效，系统会保存你的推荐来源。",
    heroTitle: "用一个页面追踪热门 Polymarket 市场",
    heroBody: "浏览市场、比较价格，并在交易功能启用后通过 Polymarket 自行签署交易。",
    safetyAria: "平台安全披露",
    badges: ["非托管", "用户自行签署", "热门市场", "交易尚未启用"],
    viewTrending: "查看热门市场",
    inviteFriends: "邀请朋友",
    copyInvite: "复制邀请链接",
    copied: "已复制",
    previewAria: "热门市场预览",
    trendingMarkets: "热门市场",
    sourceLabel: "Polymarket / Gamma",
    priceTrend: "价格走势",
    volume: "成交量",
    marketSyncingTitle: "市场数据同步中",
    marketSyncingBody: "稍后可在市场页查看开放市场。",
    safetyTitle: "安全披露",
    trendingSection: "热门 Polymarket 市场",
    viewAll: "查看全部",
    emptyTitle: "暂时没有符合条件的开放市场。",
    emptySr: "暂时没有活跃市场数据",
    emptyBody: "市场数据可能已过期，请稍后再试。",
    noOutcomes: "结果数据同步中",
    nonCustodial: "非托管",
    liquidity: "流动性",
    closeTime: "收市时间",
    source: "来源",
    original: "原文：",
    lastUpdated: "最后更新：",
    viewMarket: "查看市场",
    howItWorks: "如何运作",
    steps: ["浏览 Polymarket 市场", "连接钱包", "用户自行签署订单", "合资格交易可产生 Builder 费用收入"],
    safetySection: "安全说明",
    safetyBodyOne: "本平台不会代用户下注或交易，也不托管用户在 Polymarket 的资金。",
    safetyBodyTwo: "交易功能只会在钱包、Polymarket 凭证、Builder Code 及提交流程准备好后启用。",
    ambassadorTitle: "Ambassador",
    ambassadorBody: "分享市场链接。当你直接推荐的用户通过本平台完成合资格交易，并产生已确认的 Builder 费用收入后，你可获得推荐奖励。",
    getReferralLink: "获取推荐链接",
  },
};

const priceOrUnavailable = (value: number | null, locale: AppLocale, unavailable: string): string =>
  value === null || value <= 0 ? unavailable : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatMarketMoney = (value: number | null | undefined, locale: AppLocale): string =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const formatOptionalDateTime = (locale: AppLocale, value: string | null | undefined): string =>
  value ? formatDateTime(locale, value, "UTC") : "—";

const sparklinePoints = (market: ExternalMarketApiRecord) =>
  market.priceHistory?.length
    ? market.priceHistory.slice(-50).map((point) => ({ timestamp: point.timestamp, value: point.price }))
    : market.recentTrades.filter((trade) => trade.price !== null).slice(0, 12).reverse().map((trade) => ({ timestamp: trade.tradedAt, value: trade.price }));

const isExplicitlyStaleMarket = (market: ExternalMarketApiRecord): boolean => {
  const provenance = market.sourceProvenance ?? market.provenance;
  return Boolean(provenance && typeof provenance === "object" && (provenance as Record<string, unknown>).stale === true);
};

const getTrendingMarkets = async (locale: AppLocale): Promise<ExternalMarketApiRecord[]> => {
  try {
    const markets = await listExternalMarkets(locale, "open");
    const matches = (market: ExternalMarketApiRecord, allowStale = false) =>
      market.source === "polymarket" &&
      isExternalMarketOpenNow(market) &&
      ((allowStale && !isExplicitlyStaleMarket(market)) || !isExternalMarketStale(market)) &&
      hasExternalMarketActivity(market) &&
      hasExternalMarketPriceData(market);
    const freshMarkets = markets.filter((market) => matches(market));
    const displayMarkets = freshMarkets.length > 0 ? freshMarkets : markets.filter((market) => matches(market, true));

    return [...displayMarkets]
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
  const copy = homeCopy[locale];
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
          <strong>{copy.referralPrefix}{refCode}</strong>
          <span>{copy.referralSuffix}</span>
        </div>
      ) : (
        <PendingReferralNotice
          prefix={copy.referralPrefix}
          suffix={copy.referralSuffix}
        />
      )}
      <section className="hero landing-hero">
        <div className="hero-copy stack">
          <h1>{copy.heroTitle}</h1>
          <p>{copy.heroBody}</p>
          <div className="trust-badge-row" aria-label={copy.safetyAria}>
            {copy.badges.map((label) => (
              <StatusChip key={label}>{label}</StatusChip>
            ))}
          </div>
          <div className="market-actions">
            <Link className="button-link primary-cta" href={marketHref}>{copy.viewTrending}</Link>
            <Link className="button-link secondary" href={getLocaleHref(locale, "/ambassador")}>{copy.inviteFriends}</Link>
            <TrackedCopyButton
              value={inviteUrl}
              label={copy.copyInvite}
              copiedLabel={copy.copied}
              eventName="invite_link_copied"
              metadata={refCode ? { code: refCode, surface: "home" } : { surface: "home" }}
            />
          </div>
        </div>
        <aside className="hero-market-preview panel stack" aria-label={copy.previewAria}>
          <div className="section-heading-row">
            <strong>{copy.trendingMarkets}</strong>
            <StatusChip tone="info">{copy.sourceLabel}</StatusChip>
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
                    <strong>{priceOrUnavailable(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid, locale, copy.priceUnavailable)}</strong>
                  </span>
                ))}
              </div>
              <MarketSparkline
                points={sparklinePoints(markets[0])}
                label={copy.priceTrend}
                hideWhenEmpty
              />
              <div className="kv"><span className="kv-key">{copy.volume}</span><span className="kv-value">{formatMarketMoney(markets[0].volume24h ?? markets[0].volumeTotal, locale)}</span></div>
            </>
          ) : (
            <EmptyState title={copy.marketSyncingTitle}>{copy.marketSyncingBody}</EmptyState>
          )}
        </aside>
      </section>

      <BetaLaunchDisclosure locale={locale} />

      <SharedSafetyDisclosure locale={locale} title={copy.safetyTitle} />
      <SharedRewardDisclosure locale={locale} />

      <section className="stack">
        <div className="section-heading-row">
          <h2 className="section-title">{copy.trendingSection}</h2>
          <Link href={marketHref}>{copy.viewAll}</Link>
        </div>
        {markets.length === 0 ? (
          <EmptyState title={copy.emptyTitle}><span className="sr-only">{copy.emptySr}</span>{copy.emptyBody}</EmptyState>
        ) : (
          <div className="grid">
            {markets.map((market) => (
              <article className="panel stack home-market-card" key={market.id}>
                <div className="home-market-image-frame">
                  <HomeMarketImage imageUrl={market.imageUrl} iconUrl={market.iconUrl} alt={localizeMarketTitle(market, locale)} />
                </div>
                <div className="market-card-meta">
                  <StatusChip tone="info">{copy.trendingMarkets}</StatusChip>
                  <StatusChip tone="success">{copy.nonCustodial}</StatusChip>
                </div>
                <strong>{localizeMarketTitle(market, locale)}</strong>
                <div className="muted">
                  {market.outcomes.length > 0
                    ? market.outcomes.map((outcome) => localizeOutcomeLabel(outcome.title, locale)).join(" / ")
                    : copy.noOutcomes}
                </div>
                <div className="outcome-pill-row">
                  {market.outcomes.slice(0, 3).map((outcome) => (
                    <span className="outcome-pill" key={outcome.externalOutcomeId}>
                      <span>{localizeOutcomeLabel(outcome.title, locale)}</span>
                      <strong>{priceOrUnavailable(outcome.lastPrice ?? outcome.bestAsk ?? outcome.bestBid, locale, copy.priceUnavailable)}</strong>
                    </span>
                  ))}
                </div>
                <MarketSparkline
                  points={sparklinePoints(market)}
                  label={copy.priceTrend}
                  hideWhenEmpty
                />
                <div className="kv"><span className="kv-key">{copy.volume}</span><span className="kv-value">{formatMarketMoney(market.volume24h ?? market.volumeTotal, locale)}</span></div>
                <div className="kv"><span className="kv-key">{copy.liquidity}</span><span className="kv-value">{formatMarketMoney(market.liquidity ?? null, locale)}</span></div>
                <div className="kv"><span className="kv-key">{copy.closeTime}</span><span className="kv-value">{formatOptionalDateTime(locale, market.closeTime)}</span></div>
                <div className="kv"><span className="kv-key">{copy.source}</span><span className="kv-value">{copy.sourceLabel}</span></div>
                {getOriginalMarketTitle(market) && getOriginalMarketTitle(market) !== localizeMarketTitle(market, locale) ? <div className="muted">{copy.original}{getOriginalMarketTitle(market)}</div> : null}
                <div className="muted">{copy.lastUpdated}{formatOptionalDateTime(locale, market.lastUpdatedAt ?? market.lastSyncedAt)}</div>
                <Link className="button-link secondary" href={`${getLocaleHref(locale, `/polymarket/${encodeURIComponent(market.slug || market.externalId)}`)}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`}>
                  {copy.viewMarket}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">{copy.howItWorks}</h2>
        <div className="grid">
          {copy.steps.map((item, index) => (
            <article className="panel stack visual-step-card" key={item}>
              <StatusChip>0{index + 1}</StatusChip>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">{copy.safetySection}</h2>
        <div className="panel stack">
          <p>{copy.safetyBodyOne}</p>
          <p>{copy.safetyBodyTwo}</p>
        </div>
      </section>

      <section className="premium-band stack">
        <h2 className="section-title">{copy.ambassadorTitle}</h2>
        <div className="panel stack invite-link-card">
          <p>{copy.ambassadorBody}</p>
          <Link className="button-link secondary" href={getLocaleHref(locale, "/ambassador")}>{copy.getReferralLink}</Link>
        </div>
      </section>
    </main>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  return renderHomePage(defaultLocale, searchParams);
}
