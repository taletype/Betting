export default async function handler(_request: Request): Promise<Response> {
  return Response.json({
    ok: true,
    function: "upload-evidence",
    note: "TODO: upload and validate resolution evidence",
  });
}
