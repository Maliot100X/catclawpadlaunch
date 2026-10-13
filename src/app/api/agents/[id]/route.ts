import { NextRequest } from "next/server";
import { getAgent, runAgent, agentHoldings } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** GET  /api/agents/[id]      -> agent + its real activity log + live holdings
 *  POST /api/agents/[id]      -> run one decision cycle (real on-chain trades)
 */
export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  try {
    const found = await getAgent(id);
    if (!found) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });
    let holdings: any[] = [];
    try { holdings = await agentHoldings(id); } catch { /* holdings are best-effort */ }
    return Response.json({ ok: true, ...found, holdings }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  try {
    const result = await runAgent(id);
    return Response.json({ ok: !result.error, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
