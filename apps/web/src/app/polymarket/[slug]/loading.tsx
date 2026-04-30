export default function PolymarketMarketLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <div className="badge badge-info">Polymarket</div>
        <h1>正在載入市場資料</h1>
        <p>正在讀取 Polymarket 市場、圖表、訂單簿及非託管交易狀態。</p>
      </section>
      <section className="skeleton-grid">
        <div className="panel skeleton-card">正在載入市場摘要...</div>
        <div className="panel skeleton-card">正在載入結果價格...</div>
        <div className="panel skeleton-card">正在載入交易狀態...</div>
      </section>
    </main>
  );
}
