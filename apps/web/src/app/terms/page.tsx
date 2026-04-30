import React from "react";

import { BetaLaunchDisclosure, SafetyDisclosure } from "../product-ui";

export default function TermsPage() {
  return (
    <main className="stack legal-page">
      <section className="hero">
        <span className="badge badge-warning">BETA TERMS</span>
        <h1>服務條款</h1>
        <p>本公開 Beta 提供 zh-HK Polymarket 市場瀏覽、推薦捕捉、邀請儀表板、獎勵帳務預覽及管理員覆核工具。</p>
      </section>
      <BetaLaunchDisclosure />
      <section className="grid">
        <SafetyDisclosure title="年齡及地區限制">
          你必須達到所在地區法定年齡，並自行確認所在地區允許你瀏覽 Polymarket 相關資訊及使用第三方服務。本平台不會繞過任何地區限制。
        </SafetyDisclosure>
        <section className="panel stack">
          <span className="metric-label">Beta 範圍</span>
          <h2 className="section-title">市場資訊入口</h2>
          <p className="muted">本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。任何 Polymarket 操作均由用戶自行在 Polymarket 或其錢包流程中處理。</p>
        </section>
      </section>
      <section className="panel stack">
        <div className="section-heading-row">
          <h2 className="section-title">推薦及獎勵</h2>
          <span className="badge badge-warning">人工覆核</span>
        </div>
        <p className="muted">推薦獎勵只屬帳務紀錄及人工覆核流程，不代表盈利承諾、下單能力或自動支付安排。</p>
      </section>
    </main>
  );
}
