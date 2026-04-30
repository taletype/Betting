import { NextResponse } from "next/server";

export const legacyRouteGone = () =>
  NextResponse.json(
    {
      error: "legacy_route_quarantined",
      message: "This legacy custodial betting route is no longer available.",
    },
    { status: 410 },
  );
