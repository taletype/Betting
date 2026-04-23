import { getExternalMarketRecord, listExternalMarketRecords, listExternalMarketTrades } from "./repository";

export const listExternalMarkets = async () => listExternalMarketRecords();

export const getExternalMarketBySourceAndId = async (source: string, externalId: string) =>
  getExternalMarketRecord(source, externalId);

export const getExternalMarketTradesBySourceAndId = async (source: string, externalId: string) =>
  listExternalMarketTrades(source, externalId);
