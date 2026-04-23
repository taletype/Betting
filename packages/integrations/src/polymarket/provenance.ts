export interface SourceProvenance {
  source: "polymarket";
  upstream: "gamma-api.polymarket.com" | "clob.polymarket.com" | "data-api.polymarket.com";
  endpoint: string;
  fetchedAt: string;
}

export const createProvenance = (
  upstream: SourceProvenance["upstream"],
  endpoint: string,
): SourceProvenance => ({
  source: "polymarket",
  upstream,
  endpoint,
  fetchedAt: new Date().toISOString(),
});
