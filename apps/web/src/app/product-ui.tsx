import React from "react";

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
