import Link from "next/link";

export default function InviteRewardsGuidePage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>邀請及推薦獎勵</h1>
        <p>推薦碼可在登入前透過 `?ref=CODE` 捕捉，並保存在 cookie 及 localStorage。登入或註冊後，第一個有效推薦碼會嘗試套用。</p>
      </section>
      <section className="panel stack">
        <h2 className="section-title">獎勵規則</h2>
        <p>獎勵只適用於直接推薦，並只根據合資格交易產生的已確認 Builder 費用收入記錄。</p>
        <p>系統會拒絕自我推薦及已停用推薦碼；既有有效歸因優先。</p>
        <p>獎勵計算可自動記錄，但實際支付需要管理員審批。</p>
        <Link href="/ambassador">前往邀請朋友</Link>
      </section>
    </main>
  );
}
