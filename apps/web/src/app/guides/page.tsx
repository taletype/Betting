import React from "react";
import Link from "next/link";

import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { guides } from "./guide-data";

export default function GuidesIndexPage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>指南</h1>
        <p>Polymarket 路由、Builder 費用、推薦獎勵及 Polygon pUSD 支付的公開說明。</p>
      </section>
      <BuilderFeeDisclosureCard locale="zh-HK" />
      <section className="grid">
        {guides.map((guide) => (
          <article className="panel stack" key={guide.slug}>
            <h2 className="section-title">{guide.title}</h2>
            <p className="muted">{guide.summary}</p>
            <Link href={`/guides/${guide.slug}`}>閱讀指南</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
