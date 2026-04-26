import { verifyCronRequest } from "../_lib/verify-cron-request";

const getApiBaseUrl = (): string => {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured?.trim()) {
    return configured.replace(/\/+$/, "");
  }

  throw new Error("Missing API_BASE_URL for cron external sync trigger");
};

export async function GET(request: Request) {
  const unauthorized = verifyCronRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const adminToken = process.env.ADMIN_API_TOKEN?.trim();
  if (!adminToken) {
    return Response.json({ error: "Missing ADMIN_API_TOKEN for cron external sync trigger" }, { status: 500 });
  }

  const response = await fetch(`${getApiBaseUrl()}/admin/external-sync/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return Response.json(
    {
      ok: response.ok,
      job: "external-sync",
      idempotent: true,
      upstreamStatus: response.status,
      ...payload,
    },
    { status: response.ok ? 202 : response.status },
  );
}
