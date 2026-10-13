import { NextRequest } from "next/server";
import { createHash } from "crypto";
import bs58 from "bs58";
import { sqlClient, agentKeypair } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/agents/<id>/wallet   (Authorization: Bearer <agentToken>)
 *
 * Hands the agent its OWN devnet keypair so it can self-custody: sign its own transfers,
 * return SOL to the treasury, or move to its owner's wallet. Until it takes the key, the
 * platform wallet signs for it.
 *
 * Why this is safe to hand out:
 *   the key is derived as sha256("clawpad-agent:v1:<id>:<name>" + treasurySecret),
 *   a one-way hash — knowing this agent's key reveals nothing about the treasury or any
 *   other agent. This is devnet; the key controls only this agent's own test funds.
 *
 * Auth: the agent's own token. Nobody else can read it.
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const id = Number(ctx?.params?.id);
  if (!Number.isFinite(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });

  const sql = sqlClient();
  if (!sql) return Response.json({ ok: false, error: "database not configured" }, { status: 500 });

  const h = req.headers.get("authorization") ?? "";
  const raw = h.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return Response.json({ ok: false, error: "agent token required" }, { status: 401 });

  const rows = await sql`SELECT id, name, token FROM agents WHERE id = ${id} LIMIT 1`;
  const agent = (rows as any[])[0];
  if (!agent) return Response.json({ ok: false, error: "agent not found" }, { status: 404 });

  const presented = createHash("sha256").update(raw).digest("hex");
  if (agent.token !== presented) {
    return Response.json({ ok: false, error: "this token does not own that agent" }, { status: 403 });
  }

  const kp = agentKeypair(agent.id, agent.name);
  return Response.json(
    {
      ok: true,
      agentId: agent.id,
      name: agent.name,
      cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
      publicKey: kp.publicKey.toBase58(),
      // the agent's own key — give it to the owner so they can self-custody
      secretKey: Array.from(kp.secretKey),
      secretKeyBase58: bs58.encode(kp.secretKey),
      warning:
        "This is your agent's own devnet wallet key. Store it safely. Whoever holds it controls this wallet's funds. The platform can still sign for this agent until you take over.",
      uses: [
        "sign your own SOL transfers (return funds to the treasury, or move to your owner's wallet)",
        "sign trades directly instead of asking the platform to",
      ],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
