import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { sqlClient } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/agents/login  { agentToken }
 * Agent (or its owner) signs in with the agentToken issued at registration.
 * Tokens are stored sha256-hashed, so we hash and look up — the raw token is never stored.
 * Returns the agent's public identity; the caller keeps the token and sends it as
 * `Authorization: Bearer <agentToken>` for owner-only actions.
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const raw = String(body?.agentToken ?? body?.token ?? "").trim();
  if (!raw) return Response.json({ ok: false, error: "agentToken required" }, { status: 400 });

  const sql = sqlClient();
  if (!sql) return Response.json({ ok: false, error: "database not configured" }, { status: 500 });

  const hash = createHash("sha256").update(raw).digest("hex");
  const rows = await sql`
    SELECT id, name, strategy, personality, pubkey, status, budget_sol, owner_wallet, wallet_mode, model_url, created_at
    FROM agents WHERE token = ${hash} LIMIT 1
  `;
  const agent = (rows as any[])[0];
  if (!agent) return Response.json({ ok: false, error: "invalid agent token" }, { status: 401 });

  return Response.json(
    { ok: true, agentId: agent.id, agent },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** GET /api/agents/login?token=… — convenience check that a token is still valid. */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!raw) return Response.json({ ok: false, error: "token required" }, { status: 400 });
  const sql = sqlClient();
  if (!sql) return Response.json({ ok: false, error: "database not configured" }, { status: 500 });
  const hash = createHash("sha256").update(raw).digest("hex");
  const rows = await sql`SELECT id, name, pubkey, status FROM agents WHERE token = ${hash} LIMIT 1`;
  const agent = (rows as any[])[0];
  if (!agent) return Response.json({ ok: false, error: "invalid agent token" }, { status: 401 });
  return Response.json({ ok: true, agentId: agent.id, agent }, { headers: { "Cache-Control": "no-store" } });
}
