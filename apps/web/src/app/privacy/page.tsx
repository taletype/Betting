import React from "react";

import { BetaLaunchDisclosure, SafetyDisclosure } from "../product-ui";

export default function PrivacyPage() {
  return (
    <main className="stack legal-page">
      <section className="hero">
        <span className="badge badge-info">PRIVACY</span>
        <h1>私隱政策</h1>
        <p>本公開 Beta 會處理推薦碼、登入狀態、邀請連結互動、市場瀏覽事件及人工支付覆核所需資料。</p>
      </section>
      <BetaLaunchDisclosure />
      <section className="grid">
        <SafetyDisclosure title="資料用途">
          資料用於市場探索、推薦歸因、獎勵帳務預覽、安全覆核及管理員審批。本平台不會在前端公開 Builder Code、API 憑證或服務角色密鑰。
        </SafetyDisclosure>
        <section className="panel stack">
          <span className="metric-label">Wallet data</span>
          <h2 className="section-title">錢包及支付資料</h2>
          <p className="muted">如你提交 Polygon 錢包地址作人工支付申請，該資料只用於覆核及記錄支付目的地。鏈上交易雜湊可能會用於審計及支付狀態記錄。</p>
        </section>
      </section>
      <section className="panel stack">
        <div className="section-heading-row">
          <h2 className="section-title">安全邊界</h2>
          <span className="badge badge-success">前端保護</span>
        </div>
        <p className="muted">登入、推薦、邀請及獎勵資料只用於產品功能及審計流程。敏感服務密鑰必須留在伺服器端，不應出現在瀏覽器或公開頁面。</p>
      </section>
    </main>
  );
}
