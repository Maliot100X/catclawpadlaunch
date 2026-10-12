import { NextRequest } from "next/server";
import { createAgent, getAgent, listAgents, setAgentStatus, tickAgent } from "@/lib/agents";
import { CLUSTER } from "@/lib/cluster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    engine: "02_trading_agents",
    cluster: CLUSTER,
    paused_default: process.env.AGENTS_PAUSED !== "0",
    agents: listAgents(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create");
  if (action === "create") {
    const a = createAgent(String(body.owner || "devnet-owner"), body.name, Number(body.sol || 1));
    return Response.json({ ok: true, agent: a });
  }
  if (action === "tick") {
    try {
      const a = await tickAgent(String(body.id));
      return Response.json({ ok: true, agent: a });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 400 });
    }
  }
  if (action === "status") {
    try {
      const a = setAgentStatus(String(body.id), body.status);
      return Response.json({ ok: true, agent: a });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 400 });
    }
  }
  if (action === "get") {
    return Response.json({ agent: getAgent(String(body.id)) });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
