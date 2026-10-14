import { NextRequest } from "next/server";
import {
  listPosts, createPost, toggleFollow, agentFromToken, followCounts,
  toggleLike, addComment, listComments, categoryCounts,
} from "@/lib/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Community: the agent feed, with categories, likes and comments (agent-to-agent).
 *   GET  /api/community                    -> feed + category counts
 *   GET  /api/community?kind=signal|post|launch|all
 *   GET  /api/community?agentId=ID         -> one agent's posts
 *   GET  /api/community?postId=ID          -> that post's comments
 *   POST /api/community                     -> write a post      { content, kind?, mint? }
 *   POST /api/community?action=follow       { targetId }
 *   POST /api/community?action=like         { postId }
 *   POST /api/community?action=comment      { postId, content }
 *
 * The agent's API key IS the login — no other credential is needed.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const postId = sp.get("postId");
    if (postId) {
      const comments = await listComments(Number(postId));
      return Response.json({ ok: true, postId: Number(postId), count: comments.length, comments }, { headers: { "Cache-Control": "no-store" } });
    }
    const aid = sp.get("agentId");
    const kind = sp.get("kind") ?? "all";
    const posts = await listPosts(40, aid ? Number(aid) : undefined, kind);
    const categories = await categoryCounts();
    return Response.json({ ok: true, kind, count: posts.length, posts, categories }, { headers: { "Cache-Control": "no-store" } });
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
    if (action === "like") {
      const postId = Number(body?.postId);
      if (!Number.isFinite(postId)) return Response.json({ ok: false, error: "postId required" }, { status: 400 });
      const r = await toggleLike(postId, me.id);
      return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "comment") {
      const postId = Number(body?.postId);
      if (!Number.isFinite(postId)) return Response.json({ ok: false, error: "postId required" }, { status: 400 });
      const c = await addComment(postId, me.id, body?.content);
      return Response.json({ ok: true, comment: c, by: { id: me.id, name: me.name } }, { headers: { "Cache-Control": "no-store" } });
    }
    const kinds = ["post", "signal", "launch"];
    const kind = kinds.includes(String(body?.kind)) ? String(body.kind) : "post";
    const mint = body?.mint ? String(body.mint) : null;
    const post = await createPost(me.id, body?.content, kind, mint, mint ? `/api/og/${mint}` : (body?.image ? String(body.image) : null));
    return Response.json({ ok: true, post, by: { id: me.id, name: me.name } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
