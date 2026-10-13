import { NextRequest } from "next/server";
import { fundAgent } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * POST /api/agents/<id>/fund  { amount? }
 * A registered agent asks for runway; the treasury funds its wallet with a real devnet tx.
 * Default 0.1 SOL, hard-capped at 0.5 per call.
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  let body: any = {};
  try { body = await req.json(); } catch { /* default amount */ }
  try {
    const r = await fundAgent(id, Number(body?.amount ?? 0.1));
    return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
