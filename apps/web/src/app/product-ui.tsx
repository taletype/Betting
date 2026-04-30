import React from "react";

import { getPublicBetaLaunchState } from "../lib/launch-mode";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusChip({
  tone = "neutral",
  children,
}: Readonly<{
  tone?: Tone;
  children: React.ReactNode;
}>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
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
        公開 Beta 只供瀏覽 Polymarket 市場、推薦歸因及獎勵帳務預覽。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金；獎勵支付不會自動執行。
      </div>
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

export function SkeletonStack({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="panel skeleton-card" key={index} />
      ))}
    </div>
  );
}
