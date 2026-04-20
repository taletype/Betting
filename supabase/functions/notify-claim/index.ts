export default async function handler(_request: Request): Promise<Response> {
  return Response.json({
    ok: true,
    function: "notify-claim",
    idempotent: true,
    note: "TODO: claim notification dispatch",
  });
}
