import { verifyCronRequest } from "../_lib/verify-cron-request";

export async function GET(request: Request) {
  const unauthorized = verifyCronRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  return Response.json({
    ok: true,
    job: "candles",
    idempotent: true,
    note: "TODO: trigger candles aggregation worker",
  });
}
