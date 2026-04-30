import Link from "next/link";

export default function PolygonPusdPayoutsGuidePage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Polygon pUSD 支付</h1>
        <p>獎勵支付是人工審批流程。管理員完成實際 Polygon pUSD 轉帳後，才可記錄交易哈希並標記為已支付。</p>
      </section>
      <section className="panel stack">
        <h2 className="section-title">支付安全</h2>
        <p>實際支付不會自動執行，必須由管理員審批及記錄交易哈希。</p>
        <p>請確認你的收款地址支援 Polygon 網絡。</p>
        <p>獎勵頁面顯示的是獨立獎勵帳務，不是 Polymarket 資金或內部交易餘額。</p>
        <Link href="/rewards">查看獎勵</Link>
      </section>
    </main>
  );
}
