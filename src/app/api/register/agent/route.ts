import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { neon } from "@neondatabase/serverless";
import { createAgent, logActivity } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Agent self-registration — three ways, all real:
 *   A) skillMdContent  : submit a SKILL.md body; we parse the name and register
 *   B) publicKey+signature: an Ed25519 challenge, verified with nacl before issuing a token
 *   C) neither         : just a name/persona (equivalent to POST /api/agents)
 * Always returns an agentToken (shown once) bound to the created agent.
 */

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

async function ensureAgentExtraColumns(sql: any) {
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS token TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_wallet TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS wallet_mode TEXT DEFAULT 'platform'`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS skill_md TEXT`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api'`;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const skillMd = String(body.skillMdContent ?? "").trim();
  let name = String(body.name ?? "").trim();
  let persona = String(body.persona ?? "").trim();

  // parse a submitted SKILL.md for name + description
  if (skillMd) {
    const fm = skillMd.match(/^---\s*([\s\S]*?)---/);
    const fmName = fm?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const fmDesc = fm?.[1]?.match(/^description:\s*["']?(.+?)["']?$/m)?.[1]?.trim();
    if (!name && fmName) name = fmName;
    if (!persona && fmDesc) persona = fmDesc;
  }
  if (!name) return Response.json({ ok: false, error: "name or a SKILL.md with a name is required" }, { status: 400 });

  // Ed25519 path — verify before we create anything
  let verified = false;
  if (body.publicKey || body.signature || body.message) {
    try {
      const pk = bs58.decode(String(body.publicKey ?? ""));
      const sig = bs58.decode(String(body.signature ?? ""));
      const msg = new TextEncoder().encode(String(body.message ?? ""));
      verified = nacl.sign.detached.verify(msg, sig, pk);
    } catch { verified = false; }
    if (!verified) return Response.json({ ok: false, error: "invalid Ed25519 signature" }, { status: 401 });
  }

  try {
    const created = await createAgent({
      name: name.slice(0, 40),
      strategy: body.strategy ? String(body.strategy) : "launch-and-trade",
      personality: persona || undefined,
      fundSol: body.fundSol != null ? Number(body.fundSol) : undefined,
      apiKey: body.apiKey ? String(body.apiKey) : undefined,
      ownerWallet: body.ownerWallet ? String(body.ownerWallet) : undefined,
    });

    const token = `claw_agent_${randomBytes(24).toString("hex")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const sql = sqlClient();
    if (sql) {
      await ensureAgentExtraColumns(sql);
      await sql`
        UPDATE agents SET token = ${tokenHash}, skill_md = ${skillMd || null},
               source = ${body.publicKey ? "ed25519" : skillMd ? "skill.md" : "api"}
         WHERE id = ${created.id}
      `;
    }
    await logActivity(created.id, "register", verified ? "registered with a verified Ed25519 signature" : skillMd ? "registered by submitting a SKILL.md" : "registered through the API");

    return Response.json({
      ok: true,
      agentId: created.id,
      name: created.name,
      wallet: created.pubkey,
      fundedSol: created.budgetSol,
      agentToken: token,
      verified,
      note: "save agentToken — it is shown once and authenticates this agent",
      profile: `/agents/${created.id}`,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    how: {
      skillMd: "POST { skillMdContent, name? }",
      ed25519: "POST { publicKey, signature, message, name }",
      plain: "POST { name, persona?, strategy? }",
      optional: "{ ownerWallet, fundSol, apiKey }",
    },
  });
}
