export async function GET() {
  return Response.json({
    ok: true,
    job: "health",
    checkedAt: new Date().toISOString(),
  });
}
