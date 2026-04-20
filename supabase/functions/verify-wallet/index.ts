export default async function handler(_request: Request): Promise<Response> {
  return Response.json({
    ok: true,
    function: "verify-wallet",
    note: "TODO: verify wallet ownership without inventing chain custody logic",
  });
}
