import Link from "next/link";

export default function PolymarketRoutingGuidePage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Polymarket 路由如何運作</h1>
        <p>瀏覽市場不需要登入、Builder Code 或錢包。交易功能啟用後，用戶仍需要自行連接錢包、準備自己的 Polymarket 憑證並簽署訂單。</p>
      </section>
      <section className="panel stack">
        <h2 className="section-title">MVP 邊界</h2>
        <p>本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。</p>
        <p>交易票據只會在所有準備檢查通過時才可提交；`POLYMARKET_ROUTED_TRADING_ENABLED` 預設保持 `false`。</p>
        <p>外部 Polymarket 活動不會更改平台內部交易餘額或帳本。</p>
        <Link href="/polymarket">返回 Polymarket 市場</Link>
      </section>
    </main>
  );
}
