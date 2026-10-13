import { NextRequest } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET  /api/agents        -> every agent + live wallet balances
 *  POST /api/agents {name, strategy, personality, fundSol, apiKey?} -> create + fund (real tx)
 */
export async function GET() {
  try {
    const agents = await listAgents();
    return Response.json({ ok: true, agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  if (!body?.name) return Response.json({ ok: false, error: "name required" }, { status: 400 });
  try {
    const created = await createAgent({
      name: String(body.name),
      strategy: body.strategy ? String(body.strategy) : undefined,
      personality: body.personality ? String(body.personality) : undefined,
      fundSol: body.fundSol != null ? Number(body.fundSol) : undefined,
      apiKey: body.apiKey ? String(body.apiKey) : undefined,
      // anyone can bring their own wallet; without one the platform wallet funds the agent
      ownerWallet: body.ownerWallet ? String(body.ownerWallet).trim().slice(0, 64) : undefined,
    });
    return Response.json({ ok: true, ...created }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
