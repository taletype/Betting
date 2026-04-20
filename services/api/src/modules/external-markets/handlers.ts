import { getExternalMarketRecord, listExternalMarketRecords } from "./repository";

export const listExternalMarkets = async () => listExternalMarketRecords();

export const getExternalMarketBySourceAndId = async (source: string, externalId: string) =>
  getExternalMarketRecord(source, externalId);
