export default function PolymarketLoading() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>Polymarket 市場</h1>
        <p>正在載入 Polymarket 市場、價格及上次同步資料。</p>
        <div className="trust-badge-row">
          <span className="badge badge-info">Beta</span>
          <span className="badge badge-success">非託管</span>
          <span className="badge badge-warning">交易尚未啟用</span>
        </div>
      </section>
      <section className="skeleton-grid">
        <div className="panel skeleton-card">正在載入 Polymarket 市場…</div>
        <div className="panel skeleton-card">正在載入 Polymarket 市場…</div>
        <div className="panel skeleton-card">正在載入 Polymarket 市場…</div>
      </section>
    </main>
  );
}
