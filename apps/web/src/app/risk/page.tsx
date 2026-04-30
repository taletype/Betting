import React from "react";

import { BetaLaunchDisclosure, SafetyDisclosure } from "../product-ui";

export default function RiskPage() {
  return (
    <main className="stack legal-page">
      <section className="hero">
        <h1>風險披露</h1>
        <p>Polymarket 市場資料可能延遲、過期、翻譯未更新或來自第三方來源。請在 Polymarket 官方頁面核對所有市場細節。</p>
      </section>
      <BetaLaunchDisclosure />
      <SafetyDisclosure title="非託管及自行決策">
        本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。交易路由預設停用，Beta 期間不會提交訂單。
      </SafetyDisclosure>
      <section className="panel stack">
        <h2 className="section-title">獎勵及支付風險</h2>
        <p className="muted">推薦獎勵只在合資格、直接推薦及已確認 Builder 費用收入出現後才會進入帳務紀錄。實際支付需要管理員審批及人工記錄，不會自動轉帳。</p>
      </section>
    </main>
  );
}

