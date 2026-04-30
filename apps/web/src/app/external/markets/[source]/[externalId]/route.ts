import { externalMarketDetailResponse } from "../../../../api/_shared/public-external-market-routes";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string; externalId: string }> },
) {
  const { source, externalId } = await params;
  return externalMarketDetailResponse(source, externalId, request);
}
