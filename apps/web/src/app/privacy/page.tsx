import React from "react";

import { BetaLaunchDisclosure, SafetyDisclosure } from "../product-ui";

export default function PrivacyPage() {
  return (
    <main className="stack legal-page">
      <section className="hero">
        <h1>私隱政策</h1>
        <p>本公開 Beta 會處理推薦碼、登入狀態、邀請連結互動、市場瀏覽事件及人工支付覆核所需資料。</p>
      </section>
      <BetaLaunchDisclosure />
      <SafetyDisclosure title="資料用途">
        資料用於市場探索、推薦歸因、獎勵帳務預覽、安全覆核及管理員審批。本平台不會在前端公開 Builder Code、API 憑證或服務角色密鑰。
      </SafetyDisclosure>
      <section className="panel stack">
        <h2 className="section-title">錢包及支付資料</h2>
        <p className="muted">如你提交 Polygon 錢包地址作人工支付申請，該資料只用於覆核及記錄支付目的地。鏈上交易雜湊可能會用於審計及支付狀態記錄。</p>
      </section>
    </main>
  );
}

