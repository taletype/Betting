import React from "react";

type ChartTone = "price" | "volume" | "liquidity" | "bid" | "ask" | "neutral";

export interface TimeSeriesPoint {
  timestamp: string;
  label?: string;
  value: number | null;
  secondaryValue?: number | null;
}

export interface DepthPoint {
  side: "bid" | "ask";
  price: number | null;
  size: number | null;
  cumulativeSize: number | null;
}

export interface SplitPoint {
  label: string;
  value: number;
  tone?: ChartTone;
}

const emptyCopy = "暫時未有圖表資料";
const chartHeight = 150;
const chartWidth = 360;
const padding = 14;

const toneColor = (tone: ChartTone): string => {
  if (tone === "volume") return "#60a5fa";
  if (tone === "liquidity") return "#f59e0b";
  if (tone === "bid") return "#34d399";
  if (tone === "ask") return "#fb7185";
  if (tone === "neutral") return "#94a3b8";
  return "#2dd4bf";
};

export const normalizeChartPoints = (points?: TimeSeriesPoint[] | null): Array<TimeSeriesPoint & { value: number }> =>
  (points ?? []).filter((point): point is TimeSeriesPoint & { value: number } =>
    typeof point.value === "number" && Number.isFinite(point.value)
  );

export const hasChartData = (points?: TimeSeriesPoint[] | null): boolean => normalizeChartPoints(points).length > 0;

export const shouldRenderSparkline = (points?: TimeSeriesPoint[] | null): boolean => normalizeChartPoints(points).length >= 2;

const finitePoints = normalizeChartPoints;

const formatValue = (value: number): string =>
  value >= 1000 ? value.toLocaleString("zh-HK", { maximumFractionDigits: 0 }) : value.toLocaleString("zh-HK", { maximumFractionDigits: 3 });

function ChartShell({
  title,
  ariaLabel,
  loading,
  stale,
  empty,
  emptyText = emptyCopy,
  children,
  compact = false,
}: {
  title: string;
  ariaLabel?: string;
  loading?: boolean;
  stale?: boolean;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`chart-panel stack ${compact ? "chart-panel-compact" : ""}`} aria-label={ariaLabel ?? title}>
      <div className="section-heading-row">
        <strong>{title}</strong>
        {stale ? <span className="badge badge-warning">資料可能不是最新</span> : null}
      </div>
      {loading ? (
        <div className="chart-skeleton" aria-label="圖表載入中" />
      ) : empty ? (
        <div className="chart-empty">{emptyText}</div>
      ) : children}
    </section>
  );
}

function LineChartSvg({
  points,
  tone = "price",
  compact = false,
}: {
  points: TimeSeriesPoint[];
  tone?: ChartTone;
  compact?: boolean;
}) {
  const values = finitePoints(points);
  const width = compact ? 180 : chartWidth;
  const height = compact ? 58 : chartHeight;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const span = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const coords = values.map((point, index) => {
    const x = padding + index * step;
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="價格走勢線圖">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-grid-line" />
      <line x1={padding} y1={padding} x2={width - padding} y2={padding} className="chart-grid-line" />
      <polyline fill="none" stroke={toneColor(tone)} strokeWidth={compact ? 2 : 2.4} strokeLinecap="round" strokeLinejoin="round" points={coords} />
      {compact ? null : values.slice(-1).map((point, index) => {
        const [x, y] = coords.split(" ").at(-1)?.split(",") ?? ["0", "0"];
        return <circle key={`${point.timestamp}:${index}`} cx={x} cy={y} r="3.5" fill={toneColor(tone)} />;
      })}
    </svg>
  );
}

function BarChartSvg({ points, tone = "volume" }: { points: TimeSeriesPoint[]; tone?: ChartTone }) {
  const values = finitePoints(points);
  const max = Math.max(...values.map((point) => point.value), 1);
  const barWidth = Math.max(5, (chartWidth - padding * 2) / values.length - 4);

  return (
    <svg className="bar-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="成交量柱狀圖">
      <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} className="chart-grid-line" />
      {values.map((point, index) => {
        const height = Math.max(2, (point.value / max) * (chartHeight - padding * 2));
        const x = padding + index * (barWidth + 4);
        const y = chartHeight - padding - height;
        return <rect key={`${point.timestamp}:${index}`} x={x} y={y} width={barWidth} height={height} rx="3" fill={toneColor(tone)} opacity="0.78" />;
      })}
    </svg>
  );
}

export function MarketSparkline({
  points,
  label = "市場熱度",
  loading,
  stale,
  hideWhenEmpty = false,
}: {
  points?: TimeSeriesPoint[] | null;
  label?: string;
  loading?: boolean;
  stale?: boolean;
  hideWhenEmpty?: boolean;
}) {
  const values = finitePoints(points ?? []);
  if (!loading && hideWhenEmpty && values.length < 2) {
    return null;
  }

  return (
    <ChartShell title={label} loading={loading} stale={stale} empty={values.length < 2} emptyText="暫時未有圖表資料" compact>
      <LineChartSvg points={values} compact />
    </ChartShell>
  );
}

export function PriceHistoryChart({ points, loading, stale }: { points?: TimeSeriesPoint[] | null; loading?: boolean; stale?: boolean }) {
  const values = finitePoints(points ?? []);
  return (
    <ChartShell title="價格走勢" loading={loading} stale={stale} empty={values.length < 2} emptyText="暫時未有價格歷史。市場資料會在同步後顯示。">
      <LineChartSvg points={values} tone="price" />
      <div className="chart-caption">最新：{values.at(-1) ? formatValue(values.at(-1)!.value) : "—"}</div>
    </ChartShell>
  );
}

export function VolumeHistoryChart({ points, loading, stale }: { points?: TimeSeriesPoint[] | null; loading?: boolean; stale?: boolean }) {
  const values = finitePoints(points ?? []);
  return (
    <ChartShell title="成交量" loading={loading} stale={stale} empty={values.length === 0} emptyText="成交資料暫時未有">
      <BarChartSvg points={values} tone="volume" />
    </ChartShell>
  );
}

export function LiquidityHistoryChart({ points, loading, stale }: { points?: TimeSeriesPoint[] | null; loading?: boolean; stale?: boolean }) {
  const values = finitePoints(points ?? []);
  return (
    <ChartShell title="流動性" loading={loading} stale={stale} empty={values.length < 2}>
      <LineChartSvg points={values} tone="liquidity" />
    </ChartShell>
  );
}

export function OrderBookDepthChart({ points, loading, stale }: { points?: DepthPoint[] | null; loading?: boolean; stale?: boolean }) {
  const depth = (points ?? []).filter((point): point is DepthPoint & { price: number; cumulativeSize: number } =>
    typeof point.price === "number" && Number.isFinite(point.price) &&
    typeof point.cumulativeSize === "number" && Number.isFinite(point.cumulativeSize)
  );
  const series = depth.map((point) => ({ timestamp: `${point.side}:${point.price}`, value: point.cumulativeSize }));
  return (
    <ChartShell title="訂單簿深度" loading={loading} stale={stale} empty={depth.length === 0} emptyText="訂單簿資料暫時未有">
      <LineChartSvg points={series} tone="bid" />
    </ChartShell>
  );
}

export function RecentTradesChart({ points, loading, stale }: { points?: TimeSeriesPoint[] | null; loading?: boolean; stale?: boolean }) {
  const values = finitePoints(points ?? []);
  return (
    <ChartShell title="近期成交" loading={loading} stale={stale} empty={values.length === 0} emptyText="成交資料暫時未有">
      <LineChartSvg points={values} tone="neutral" />
    </ChartShell>
  );
}

function SplitChart({ title, points, emptyText = emptyCopy }: { title: string; points?: SplitPoint[] | null; emptyText?: string }) {
  const values = (points ?? []).filter((point) => Number.isFinite(point.value) && point.value > 0);
  const total = values.reduce((sum, point) => sum + point.value, 0);
  return (
    <ChartShell title={title} empty={values.length === 0} emptyText={emptyText}>
      <div className="split-chart" role="img" aria-label={title}>
        {values.map((point) => (
          <div
            className="split-segment"
            key={point.label}
            style={{ width: `${(point.value / total) * 100}%`, background: toneColor(point.tone ?? "neutral") }}
            title={`${point.label}: ${formatValue(point.value)}`}
          />
        ))}
      </div>
      <div className="chart-legend">
        {values.map((point) => (
          <span key={point.label}><i style={{ background: toneColor(point.tone ?? "neutral") }} />{point.label}</span>
        ))}
      </div>
    </ChartShell>
  );
}

export function ReferralFunnelChart({ points }: { points?: TimeSeriesPoint[] | null }) {
  return <VolumeHistoryChart points={points} />;
}

export function RewardSplitChart({ points }: { points?: SplitPoint[] | null }) {
  return <SplitChart title="獎勵狀態" points={points} />;
}

export function PayoutStatusChart({ points }: { points?: SplitPoint[] | null }) {
  return <SplitChart title="支付狀態" points={points} />;
}

export function MiniMetricTrend({ label, value, points }: { label: string; value: string; points?: TimeSeriesPoint[] | null }) {
  return (
    <div className="mini-metric-trend" aria-label={label}>
      <div>
        <span className="kv-key">{label}</span>
        <strong>{value}</strong>
      </div>
      {shouldRenderSparkline(points) ? <MarketSparkline points={points} label="市場熱度" hideWhenEmpty /> : null}
    </div>
  );
}
