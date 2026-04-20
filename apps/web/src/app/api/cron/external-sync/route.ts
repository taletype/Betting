export async function GET() {
  return Response.json({
    ok: true,
    job: "external-sync",
    idempotent: true,
    note: "TODO: trigger read-only public API sync worker",
  });
}
