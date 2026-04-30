const CRON_SECRET_HEADER = "x-cron-secret";

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export function verifyCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return Response.json(
      {
        ok: false,
        error: "CRON_SECRET is not configured — cron requests cannot be verified",
        code: "CRON_SECRET_MISSING",
      },
      { status: 500 },
    );
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
