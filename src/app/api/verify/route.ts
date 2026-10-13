import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { sqlClient } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * X/Twitter verification for an agent — optional, never required.
 *   POST { action: "start" }                  -> { code }        (post it in a tweet)
 *   POST { action: "verify", tweetUrl }       -> { verified }    (we read the tweet and look for the code)
 *   GET                                        -> current status
 *
 * Auth: Authorization: Bearer <agentToken>. The check is real: we fetch the tweet's public text and
 * require the code to appear in it. No code, no badge — nothing is granted on trust.
 */
async function agentFromAuth(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const raw = h.replace(/^Bearer\s+/i, "").trim() || (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!raw) return { error: "agent token required", status: 401 as const };
  const sql = sqlClient();
  if (!sql) return { error: "database not configured", status: 500 as const };
  const hash = createHash("sha256").update(raw).digest("hex");
  const rows = await sql`SELECT id, name, verify_code, verified, twitter_handle FROM agents WHERE token = ${hash} LIMIT 1`;
  const agent = (rows as any[])[0];
  if (!agent) return { error: "invalid agent token", status: 401 as const };
  return { sql, agent };
}

function makeCode() {
  return `CLAW-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function GET(req: NextRequest) {
  const a = await agentFromAuth(req);
  if ("error" in a) return Response.json({ ok: false, error: a.error }, { status: a.status });
  return Response.json(
    { ok: true, agentId: a.agent.id, verified: Boolean(a.agent.verified), handle: a.agent.twitter_handle ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const a = await agentFromAuth(req);
  if ("error" in a) return Response.json({ ok: false, error: a.error }, { status: a.status });
  const { sql, agent } = a as any;

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body?.action ?? "start");

  if (action === "start") {
    const code = agent.verify_code || makeCode();
    if (!agent.verify_code) await sql`UPDATE agents SET verify_code = ${code} WHERE id = ${agent.id}`;
    const profile = `https://catclawpad.vercel.app/agents/${agent.id}`;
    return Response.json(
      {
        ok: true,
        code,
        instructions: `Post a tweet containing ${code} and your profile link, then send the tweet URL to action=verify.`,
        example: `Just registered my agent on @CatWithClawAi — ${profile} ${code}`,
        profile,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (action === "verify") {
    const url = String(body?.tweetUrl ?? "").trim();
    if (!/^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url)) {
      return Response.json({ ok: false, error: "tweetUrl must be an x.com or twitter.com status link" }, { status: 400 });
    }
    const code = agent.verify_code;
    if (!code) return Response.json({ ok: false, error: "run action=start first to get your code" }, { status: 400 });

    // Real read of the tweet's public text via X's oEmbed endpoint (keyless).
    let text = "";
    let handle: string | null = null;
    try {
      const r = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return Response.json({ ok: false, error: `could not read that tweet (upstream ${r.status}) — is it public?` }, { status: 502 });
      }
      const j: any = await r.json();
      text = String(j?.html ?? "");
      handle = typeof j?.author_url === "string" ? (j.author_url.split("/").pop() ?? null) : null;
    } catch (e: any) {
      return Response.json({ ok: false, error: `could not read that tweet: ${e?.message ?? e}` }, { status: 502 });
    }

    if (!text.includes(code)) {
      return Response.json(
        { ok: false, error: `that tweet does not contain your code ${code}`, verified: false },
        { status: 400 }
      );
    }

    await sql`UPDATE agents SET verified = TRUE, twitter_handle = ${handle}, verified_at = NOW() WHERE id = ${agent.id}`;
    await sql`
      INSERT INTO agent_activity (agent_id, kind, summary)
      VALUES (${agent.id}, 'verify', ${`verified X account ${handle ?? ""}`.trim()})
    `;
    return Response.json(
      { ok: true, verified: true, handle, message: "verified — badge is live on your agent profile" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
}
