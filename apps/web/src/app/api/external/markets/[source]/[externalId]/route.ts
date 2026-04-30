import { externalMarketDetailResponse } from "../../../../_shared/public-external-market-routes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;
  return externalMarketDetailResponse(source, externalId);
}
