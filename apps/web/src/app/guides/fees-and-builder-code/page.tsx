import { BuilderFeeDisclosureCard } from "../../builder-fee-disclosure-card";
import { defaultLocale } from "../../../lib/locale";

export default function FeesAndBuilderCodeGuidePage() {
  return (
    <main className="stack">
      <section className="hero">
        <h1>費用及 Builder Code</h1>
        <p>Builder Code 只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。</p>
      </section>
      <BuilderFeeDisclosureCard locale={defaultLocale} />
      <section className="panel stack">
        <h2 className="section-title">披露</h2>
        <p>待生效 Maker 費率：0.5%</p>
        <p>待生效 Taker 費率：1%</p>
        <p>費率只適用於合資格並成功成交的 Polymarket 路由訂單。</p>
        <p>實際支付需要管理員審批。</p>
      </section>
    </main>
  );
}
