import { getMarketRecordById, listMarketRecords } from "./repository";

export const listMarkets = async () => listMarketRecords();

export const getMarketById = async (marketId: string) => getMarketRecordById(marketId);
