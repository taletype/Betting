import Link from "next/link";

const guides = [
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
];

export default function GuidesPage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>指南</h1>
        <p>zh-HK MVP 指南集中說明公開市場瀏覽、推薦歸因、非託管交易邊界及人工支付流程。</p>
      </section>
      <section className="grid">
        {guides.map((guide) => (
          <article className="panel stack" key={guide.href}>
            <h2 className="section-title">{guide.title}</h2>
            <p className="muted">{guide.body}</p>
            <Link className="button-link secondary" href={guide.href}>閱讀指南</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
