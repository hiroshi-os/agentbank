export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "agentbank",
    currency: "AGC",
    realMoney: false,
  });
}
