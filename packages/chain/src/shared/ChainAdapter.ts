export interface ChainAdapter {
  readonly chain: "base" | "solana";
  healthcheck(): Promise<{ ok: boolean }>;
}
