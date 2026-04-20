import type { Market } from "@bet/contracts";

export const demoMarkets: Market[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "fed-cuts-before-year-end",
    title: "Will the Fed cut rates before year end?",
    description: "Scaffold market used for local development only.",
    status: "open",
    collateralCurrency: "USD",
    minPrice: 0n,
    maxPrice: 100n,
    tickSize: 1n,
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    closesAt: new Date("2026-12-01T00:00:00.000Z").toISOString(),
    resolvesAt: new Date("2026-12-31T00:00:00.000Z").toISOString(),
    outcomes: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        marketId: "11111111-1111-4111-8111-111111111111",
        slug: "yes",
        title: "Yes",
        index: 0,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        marketId: "11111111-1111-4111-8111-111111111111",
        slug: "no",
        title: "No",
        index: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
  },
];
