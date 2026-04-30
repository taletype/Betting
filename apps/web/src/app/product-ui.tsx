import React from "react";

import { getPublicBetaLaunchState } from "../lib/launch-mode";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const sharedSafetyCopy = "本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。";
export const sharedRewardCopy = "獎勵計算可自動記錄，但實際支付需要管理員審批。";

export function StatusChip({
  tone = "neutral",
  children,
}: Readonly<{
  tone?: Tone;
  children: React.ReactNode;
}>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const Badge = StatusChip;
export const Pill = StatusChip;

export function PageContainer({
  children,
  compact = false,
}: Readonly<{
  children: React.ReactNode;
  compact?: boolean;
}>) {
  return <main className={`page-container stack ${compact ? "page-container-compact" : ""}`}>{children}</main>;
}

export function Breadcrumb({
  items,
}: Readonly<{
  items: Array<{ label: React.ReactNode; href?: string }>;
}>) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
          {index < items.length - 1 ? <span aria-hidden="true">/</span> : null}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PrimaryButton({
  className = "",
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  return <button {...props} className={`primary-cta ${className}`.trim()} />;
}

export function GhostButton({
  className = "",
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  return <button {...props} className={`ghost-button ${className}`.trim()} />;
}

export function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: Readonly<{
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: Tone;
}>) {
  return (
    <article className={`panel stack metric-card metric-card-${tone}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-sm">{value}</div>
      {note ? <div className="muted">{note}</div> : null}
    </article>
  );
}

export const StatCard = MetricCard;

export function MetricGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section className="metric-grid">{children}</section>;
}

export function MarketCard({
  children,
  className = "",
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return <article className={`panel stack market-card ${className}`.trim()}>{children}</article>;
}

export function OutcomeCard({
  label,
  price,
  note,
  tone = "neutral",
}: Readonly<{
  label: React.ReactNode;
  price: React.ReactNode;
  note?: React.ReactNode;
  tone?: Tone;
}>) {
  return (
    <article className={`outcome-card outcome-card-${tone}`}>
      <span className="outcome-label">{label}</span>
      <strong className="outcome-price">{price}</strong>
      {note ? <span className="outcome-pct">{note}</span> : null}
    </article>
  );
}

export function SectionAccordion({
  title,
  badge,
  children,
  defaultOpen = false,
}: Readonly<{
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}>) {
  return (
    <details className="section-accordion" open={defaultOpen}>
      <summary className="section-accordion-header">
        <span className="section-title-row">
          <span className="section-title">{title}</span>
          {badge ? <span className="section-badge">{badge}</span> : null}
        </span>
        <span className="section-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="section-accordion-body">{children}</div>
    </details>
  );
}

export function SafetyDisclosure({
  title = "安全提示",
  children,
}: Readonly<{
  title?: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="panel disclosure-card stack">
      <strong>{title}</strong>
      <div className="muted">{children}</div>
    </section>
  );
}

export const DisclosureCard = SafetyDisclosure;

export function AdminPanelCard({
  title,
  children,
  tone = "neutral",
}: Readonly<{
  title: React.ReactNode;
  children: React.ReactNode;
  tone?: Tone;
}>) {
  return (
    <section className={`panel stack admin-panel-card admin-panel-card-${tone}`}>
      <div className="section-heading-row">
        <strong>{title}</strong>
        <StatusChip tone={tone}>Admin</StatusChip>
      </div>
      {children}
    </section>
  );
}

export function SharedSafetyDisclosure({
  title = "安全提示",
}: Readonly<{
  title?: string;
}>) {
  return <SafetyDisclosure title={title}>{sharedSafetyCopy}</SafetyDisclosure>;
}

export function SharedRewardDisclosure({
  title = "獎勵提示",
}: Readonly<{
  title?: string;
}>) {
  return <SafetyDisclosure title={title}>{sharedRewardCopy}</SafetyDisclosure>;
}

export function BetaLaunchDisclosure() {
  const launch = getPublicBetaLaunchState();

  return (
    <section className="panel disclosure-card stack" data-testid="beta-launch-disclosure">
      <div className="section-heading-row">
        <strong>{launch.isBeta ? "Beta 公開預覽" : "正式模式"}</strong>
        <StatusChip tone={launch.isBeta ? "info" : "success"}>{launch.mode}</StatusChip>
      </div>
      <div className="trust-badge-row" aria-label="Beta launch safety state">
        <StatusChip tone={launch.isBeta ? "info" : "success"}>Beta</StatusChip>
        <StatusChip tone={launch.routedTradingEnabled ? "warning" : "success"}>
          {launch.routedTradingEnabled ? "交易路由需覆核" : "交易尚未啟用"}
        </StatusChip>
        <StatusChip tone="success">非託管</StatusChip>
        <StatusChip tone={launch.autoPayoutEnabled ? "warning" : "success"}>
          {launch.autoPayoutEnabled ? "自動支付必須停用" : "人手審批"}
        </StatusChip>
        <StatusChip tone="warning">待確認獎勵</StatusChip>
      </div>
      <div className="muted">
        公開 Beta 只供瀏覽 Polymarket 市場、推薦歸因及獎勵帳務預覽。{sharedSafetyCopy} {sharedRewardCopy} 實際支付不會自動執行。
      </div>
    </section>
  );
}

export function ReferralBanner({ code }: Readonly<{ code: string }>) {
  return (
    <div className="banner banner-success referral-banner sticky-referral">
      <strong>你正在使用推薦碼：{code}</strong>
      <span>登入或註冊後，如推薦碼有效，系統會保存你的推薦來源。</span>
    </div>
  );
}

export function ReferralShareCard({
  title = "分享市場連結",
  description,
  children,
}: Readonly<{
  title?: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section className="share-block">
      <strong className="share-title">{title}</strong>
      <p className="share-desc">{description}</p>
      <div className="share-btns">{children}</div>
    </section>
  );
}

export function TradeTicketCard({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section className="trade-card">{children}</section>;
}

export function ReadinessChecklist({
  children,
  title = "交易準備",
}: Readonly<{
  children: React.ReactNode;
  title?: React.ReactNode;
}>) {
  return (
    <section className="readiness">
      <div className="readiness-title">{title}</div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children,
}: Readonly<{
  title: string;
  children?: React.ReactNode;
}>) {
  return (
    <div className="empty-state stack">
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function LoadingState({ title = "正在載入 Polymarket 市場…" }: Readonly<{ title?: string }>) {
  return (
    <div className="empty-state loading-state">
      <strong>{title}</strong>
      <span className="skeleton-line" aria-hidden="true" />
    </div>
  );
}

export function ErrorState({
  title,
  children,
}: Readonly<{
  title: React.ReactNode;
  children?: React.ReactNode;
}>) {
  return (
    <div className="error-state stack">
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function SkeletonStack({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="panel skeleton-card" key={index} />
      ))}
    </div>
  );
}

export function DataTable({
  children,
  compact = false,
}: Readonly<{
  children: React.ReactNode;
  compact?: boolean;
}>) {
  return <div className="table-wrap"><table className={`table ${compact ? "compact-table" : ""}`}>{children}</table></div>;
}

export function CardTable({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section className="card-table stack">{children}</section>;
}
