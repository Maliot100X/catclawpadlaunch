import { NextRequest } from "next/server";
import { sellAgentPosition } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** POST /api/agents/<id>/sell { mint, pct? } — owner-triggered manual sell back into the curve. */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const mint = String(body?.mint ?? "").trim();
  if (!mint) return Response.json({ ok: false, error: "mint required" }, { status: 400 });
  try {
    const r = await sellAgentPosition(id, mint, Number(body?.pct ?? 50));
    return Response.json({ ok: true, result: r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
