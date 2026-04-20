export interface ExternalMarketSyncSource {
  listMarkets(): Promise<readonly unknown[]>;
}
