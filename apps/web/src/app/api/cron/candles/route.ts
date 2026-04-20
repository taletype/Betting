export async function GET() {
  return Response.json({
    ok: true,
    job: "candles",
    idempotent: true,
    note: "TODO: trigger candles aggregation worker",
  });
}
