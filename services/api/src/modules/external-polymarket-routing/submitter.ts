import type { ExternalPolymarketOrderRoutePayload, PolymarketOrderSubmitter } from "./handlers";

export class DisabledPolymarketClobClientV2Submitter implements PolymarketOrderSubmitter {
  async submitOrder(_payload: ExternalPolymarketOrderRoutePayload): Promise<unknown> {
    throw new Error("@polymarket/clob-client-v2 adapter is intentionally disabled until explicitly wired and validated");
  }
}
