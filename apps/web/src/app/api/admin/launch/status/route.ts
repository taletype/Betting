import { NextRequest, NextResponse } from "next/server";

import { evaluateAdminAccess, getAuthenticatedUser } from "../../../auth";
import { getSafeLaunchStatus } from "../../../_shared/launch-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  const admin = evaluateAdminAccess(user);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  return NextResponse.json(getSafeLaunchStatus());
}
