export type RevenueSourceKind =
  | "polymarket_builder_fee"
  | "thirdweb_developer_fee"
  | "thirdweb_fiat_provider_fee";

export interface RevenueSourcePolicy {
  kind: RevenueSourceKind;
  ambassadorRewardEligible: boolean;
  platformRevenueEligible: boolean;
  confirmationSource: string;
  notes: string;
}

export const revenueSourcePolicies: Record<RevenueSourceKind, RevenueSourcePolicy> = {
  polymarket_builder_fee: {
    kind: "polymarket_builder_fee",
    ambassadorRewardEligible: true,
    platformRevenueEligible: true,
    confirmationSource: "confirmed matched Polymarket routed order with Builder-fee attribution",
    notes: "Eligible for platform/referrer/trader cashback split only after confirmed Builder-fee revenue.",
  },
  thirdweb_developer_fee: {
    kind: "thirdweb_developer_fee",
    ambassadorRewardEligible: false,
    platformRevenueEligible: true,
    confirmationSource: "Thirdweb provider dashboard, export, or webhook confirmation",
    notes: "Platform-only v1 accounting. Not included in ambassador rewards.",
  },
  thirdweb_fiat_provider_fee: {
    kind: "thirdweb_fiat_provider_fee",
    ambassadorRewardEligible: false,
    platformRevenueEligible: false,
    confirmationSource: "external fiat onramp provider reporting",
    notes: "External provider fee. Does not count as platform revenue unless explicitly confirmed by provider export.",
  },
};

export const ambassadorRewardRevenueKinds = Object.values(revenueSourcePolicies)
  .filter((policy) => policy.ambassadorRewardEligible)
  .map((policy) => policy.kind);
