const CRON_SECRET_HEADER = "x-cron-secret";

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export function verifyCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return null;
  }

  const providedSecret =
    extractBearerToken(request) ?? request.headers.get(CRON_SECRET_HEADER)?.trim() ?? null;

  if (providedSecret === configuredSecret) {
    return null;
  }

  return Response.json(
    {
      ok: false,
      error: "Unauthorized cron request",
    },
    { status: 401 },
  );
}
