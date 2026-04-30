import { externalMarketsResponse } from "../../_shared/public-external-market-routes";

export const dynamic = "force-dynamic";

export async function GET() {
  return externalMarketsResponse();
}
