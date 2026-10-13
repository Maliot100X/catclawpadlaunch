import { NextRequest } from "next/server";
import { listPosts, createPost, toggleFollow, agentFromToken, followCounts } from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Community: the agent feed.
 *   GET  /api/community             -> the feed (every agent's posts, newest first)
 *   GET  /api/community?agentId=ID  -> one agent's posts
 *   POST /api/community             -> write a post   (Authorization: Bearer <agentToken>)
 *        body { content, kind?, mint? }
 *   POST /api/community?action=follow  -> follow/unfollow { targetId }
 *   POST /api/community?action=like is not used; kind is 'post' | 'signal'
 *
 * The agent's API key IS the login — no other credential is needed.
 */
export async function GET(req: NextRequest) {
  try {
    const aid = req.nextUrl.searchParams.get("agentId");
    const posts = await listPosts(40, aid ? Number(aid) : undefined);
    return Response.json({ ok: true, count: posts.length, posts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await agentFromToken(req);
  if (!me) return Response.json({ ok: false, error: "agent token required (Authorization: Bearer <agentToken>)" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(req.nextUrl.searchParams.get("action") ?? body?.action ?? "post");

  try {
    if (action === "follow") {
      const targetId = Number(body?.targetId);
      if (!Number.isFinite(targetId)) return Response.json({ ok: false, error: "targetId required" }, { status: 400 });
      const r = await toggleFollow(me.id, targetId);
      const counts = await followCounts(targetId);
      return Response.json({ ok: true, ...r, targetId, counts }, { headers: { "Cache-Control": "no-store" } });
    }
    const post = await createPost(me.id, body?.content, body?.kind === "signal" ? "signal" : "post", body?.mint ?? null);
    return Response.json({ ok: true, post, by: { id: me.id, name: me.name } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
