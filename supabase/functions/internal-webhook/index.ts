export default async function handler(_request: Request): Promise<Response> {
  return Response.json({
    ok: true,
    function: "internal-webhook",
    idempotent: true,
    note: "TODO: internal signed webhook ingress",
  });
}
