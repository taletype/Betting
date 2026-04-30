export type BuilderFeeStatus = "pending" | "active";

const parseBps = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseStatus = (value: string | undefined): BuilderFeeStatus =>
  value === "active" ? "active" : "pending";

export const builderFeeDisclosure = {
  makerFeeBps: parseBps(process.env.NEXT_PUBLIC_BUILDER_MAKER_FEE_BPS ?? process.env.BUILDER_MAKER_FEE_BPS, 50),
  takerFeeBps: parseBps(process.env.NEXT_PUBLIC_BUILDER_TAKER_FEE_BPS ?? process.env.BUILDER_TAKER_FEE_BPS, 100),
  status: parseStatus(process.env.NEXT_PUBLIC_BUILDER_FEE_STATUS ?? process.env.BUILDER_FEE_STATUS),
} as const;

export const formatBpsPercent = (bps: number): string => {
  const percent = bps / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
};

export const getBuilderFeeStatusLabel = (status: BuilderFeeStatus, locale: "zh-HK" | "zh-CN" | "en"): string => {
  if (locale !== "en") return status === "active" ? "已生效" : "待生效";
  return status === "active" ? "active" : "pending";
};
