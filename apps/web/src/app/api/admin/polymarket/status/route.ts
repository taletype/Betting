import { type NextRequest } from "next/server";

import { adminPolymarketStatusResponse } from "../../../_shared/admin-polymarket-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return adminPolymarketStatusResponse(request);
}
