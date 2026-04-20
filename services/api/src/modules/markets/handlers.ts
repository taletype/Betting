import {
  getMarketOrderBook,
  getMarketRecordById,
  getRecentMarketTrades,
  listMarketRecords,
} from "./repository";

export const listMarkets = async () => listMarketRecords();

export const getMarketById = async (marketId: string) => getMarketRecordById(marketId);

export const getOrderBookByMarketId = async (marketId: string) => getMarketOrderBook(marketId);

export const getTradesByMarketId = async (marketId: string) => getRecentMarketTrades(marketId);
