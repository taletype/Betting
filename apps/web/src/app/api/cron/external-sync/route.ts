import { verifyCronRequest } from "../_lib/verify-cron-request";

export async function GET(request: Request) {
  const unauthorized = verifyCronRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  return Response.json({
    ok: true,
    job: "external-sync",
    idempotent: true,
    note: "TODO: trigger read-only public API sync worker",
  });
}
