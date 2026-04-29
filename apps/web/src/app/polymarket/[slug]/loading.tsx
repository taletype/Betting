export default function PolymarketMarketLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <div className="badge badge-neutral">polymarket</div>
        <h1>正在載入市場資料</h1>
        <p>正在讀取 Polymarket 市場、圖表及訂單簿資料。</p>
      </section>
      <section className="panel empty-state">Loading...</section>
    </main>
  );
}
