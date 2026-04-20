export interface DeterministicMatcher {
  replay(marketId: string): Promise<void>;
}
