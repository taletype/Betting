import Link from "next/link";

import { defaultLocale, getLocaleHref, type AppLocale } from "../../lib/locale";

const guidesCopy: Record<AppLocale, {
  title: string;
  body: string;
  read: string;
  guides: Array<{ href: string; title: string; body: string }>;
}> = {
  en: {
    title: "Guides",
    body: "MVP guides covering public market browsing, referral attribution, non-custodial trading boundaries, and manual payout flow.",
    read: "Read guide",
    guides: [
      {
        href: "/guides/how-polymarket-routing-works",
        title: "How Polymarket routing works",
        body: "Understand non-custody, market browsing, user-signed orders, and the default-disabled trading boundary.",
      },
      {
        href: "/guides/invite-rewards",
        title: "Invites and referral rewards",
        body: "How referral codes are captured, applied after login, and recorded against confirmed direct-referral revenue.",
      },
      {
        href: "/guides/fees-and-builder-code",
        title: "Fees and Builder Code",
        body: "Review pending Builder fee rates, when they apply, and why browsing markets does not create Builder fees.",
      },
      {
        href: "/guides/polygon-pusd-payouts",
        title: "Polygon pUSD payouts",
        body: "Reward payouts stay manual; admins record the Polygon transaction hash before marking a payout paid.",
      },
    ],
  },
  "zh-HK": {
    title: "指南",
    body: "zh-HK MVP 指南集中說明公開市場瀏覽、推薦歸因、非託管交易邊界及人工支付流程。",
    read: "閱讀指南",
    guides: [
      {
        href: "/guides/how-polymarket-routing-works",
        title: "Polymarket 路由如何運作",
        body: "了解非託管、市場瀏覽、用戶自行簽署訂單及交易功能預設停用的邊界。",
      },
      {
        href: "/guides/invite-rewards",
        title: "邀請及推薦獎勵",
        body: "推薦碼如何捕捉、登入後如何套用，以及直接推薦獎勵如何根據已確認收入記錄。",
      },
      {
        href: "/guides/fees-and-builder-code",
        title: "費用及 Builder Code",
        body: "查看待生效 Builder 費率、適用範圍，以及單純瀏覽市場不產生 Builder 費用。",
      },
      {
        href: "/guides/polygon-pusd-payouts",
        title: "Polygon pUSD 支付",
        body: "獎勵支付維持人手審批，管理員記錄 Polygon 交易哈希後才會標記已支付。",
      },
    ],
  },
  "zh-CN": {
    title: "指南",
    body: "zh-CN MVP 指南集中说明公开市场浏览、推荐归因、非托管交易边界及人工支付流程。",
    read: "阅读指南",
    guides: [
      {
        href: "/guides/how-polymarket-routing-works",
        title: "Polymarket 路由如何运作",
        body: "了解非托管、市场浏览、用户自行签署订单及交易功能默认停用的边界。",
      },
      {
        href: "/guides/invite-rewards",
        title: "邀请及推荐奖励",
        body: "推荐码如何捕捉、登录后如何套用，以及直接推荐奖励如何根据已确认收入记录。",
      },
      {
        href: "/guides/fees-and-builder-code",
        title: "费用及 Builder Code",
        body: "查看待生效 Builder 费率、适用范围，以及单纯浏览市场不产生 Builder 费用。",
      },
      {
        href: "/guides/polygon-pusd-payouts",
        title: "Polygon pUSD 支付",
        body: "奖励支付维持人工审核，管理员记录 Polygon 交易哈希后才会标记已支付。",
      },
    ],
  },
};

export function renderGuidesPage(locale: AppLocale) {
  const copy = guidesCopy[locale];

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </section>
      <section className="grid">
        {copy.guides.map((guide) => (
          <article className="panel stack" key={guide.href}>
            <h2 className="section-title">{guide.title}</h2>
            <p className="muted">{guide.body}</p>
            <Link className="button-link secondary" href={getLocaleHref(locale, guide.href)}>{copy.read}</Link>
          </article>
        ))}
      </section>
    </main>
  );
}

export default function GuidesPage() {
  return renderGuidesPage(defaultLocale);
}
