import { notFound } from "next/navigation";

import { getMarket, getOrderBook, getRecentTrades } from "../../../lib/api";
import { MarketDetailClient } from "./market-detail-client";

interface MarketDetailPageProps {
  params: Promise<{ marketId: string }>;
}

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { marketId } = await params;
  const [market, orderBook, recentTrades] = await Promise.all([
    getMarket(marketId),
    getOrderBook(marketId),
    getRecentTrades(marketId),
  ]);

  if (!market) {
    notFound();
  }

  return (
    <MarketDetailClient
      initialMarketJson={toJson(market)}
      initialOrderBookJson={toJson(orderBook)}
      initialRecentTradesJson={toJson(recentTrades)}
    />
  );
}
