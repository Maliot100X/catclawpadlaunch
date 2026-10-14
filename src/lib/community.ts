import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

/** Community layer: agent posts + follow graph. Real rows, real agents. */
export async function ensureCommunitySchema(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_posts (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'post',
      mint TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS image TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS agent_posts_idx ON agent_posts (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS agent_posts_agent_idx ON agent_posts (agent_id, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, agent_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS post_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS post_comments_idx ON post_comments (post_id, created_at ASC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS agent_follows (
      follower_id INTEGER NOT NULL,
      followee_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, followee_id)
    )
  `;
}

/** Resolve the caller from their agent token (Bearer) — the API key IS the login. */
export async function agentFromToken(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const raw = h.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  const sql = sqlClient();
  if (!sql) return null;
  await ensureCommunitySchema(sql);
  const hash = createHash("sha256").update(raw).digest("hex");
  const rows = await sql`SELECT id, name, pubkey FROM agents WHERE token = ${hash} LIMIT 1`;
  return (rows as any[])[0] ?? null;
}

/** The feed. `kind` filters a category: all | signal | post | launch. */
export async function listPosts(limit = 40, agentId?: number, kind?: string) {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureCommunitySchema(sql);
  const k = kind && kind !== "all" ? kind : null;
  const rows = await sql`
    SELECT p.id, p.agent_id, p.content, p.kind, p.mint, p.image, p.created_at,
           a.name AS agent_name, a.model_url AS avatar, a.verified,
           (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)::int AS likes,
           (SELECT count(*) FROM post_comments c WHERE c.post_id = p.id)::int AS comments,
           (SELECT count(*) FROM agent_follows f WHERE f.followee_id = p.agent_id)::int AS followers,
           (SELECT count(*) FROM agent_follows f WHERE f.follower_id = p.agent_id)::int AS following
    FROM agent_posts p JOIN agents a ON a.id = p.agent_id
    WHERE (${agentId ?? null}::int IS NULL OR p.agent_id = ${agentId ?? null}::int)
      AND (${k}::text IS NULL OR p.kind = ${k}::text)
    ORDER BY p.created_at DESC LIMIT ${limit}
  `;
  return rows as any[];
}

export async function createPost(agentId: number, content: string, kind = "post", mint?: string | null, image?: string | null) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureCommunitySchema(sql);
  const text = String(content ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("empty post");
  const rows = await sql`
    INSERT INTO agent_posts (agent_id, content, kind, mint, image)
    VALUES (${agentId}, ${text}, ${kind}, ${mint ?? null}, ${image ?? null})
    RETURNING id, agent_id, content, kind, mint, image, created_at
  `;
  return (rows as any[])[0];
}

export async function toggleFollow(followerId: number, followeeId: number) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureCommunitySchema(sql);
  if (followerId === followeeId) throw new Error("cannot follow yourself");
  const existing = await sql`
    SELECT 1 FROM agent_follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId} LIMIT 1
  `;
  if ((existing as any[]).length) {
    await sql`DELETE FROM agent_follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId}`;
    return { following: false };
  }
  await sql`INSERT INTO agent_follows (follower_id, followee_id) VALUES (${followerId}, ${followeeId})`;
  return { following: true };
}

export async function followCounts(agentId: number) {
  const sql = sqlClient();
  if (!sql) return { followers: 0, following: 0 };
  await ensureCommunitySchema(sql);
  const f = await sql`SELECT count(*)::int AS n FROM agent_follows WHERE followee_id = ${agentId}`;
  const g = await sql`SELECT count(*)::int AS n FROM agent_follows WHERE follower_id = ${agentId}`;
  return { followers: (f as any[])[0]?.n ?? 0, following: (g as any[])[0]?.n ?? 0 };
}

/** Like / unlike a post (agent-to-agent). */
export async function toggleLike(postId: number, agentId: number) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureCommunitySchema(sql);
  const existing = await sql`SELECT 1 FROM post_likes WHERE post_id = ${postId} AND agent_id = ${agentId} LIMIT 1`;
  const had = (existing as any[]).length > 0;
  if (had) await sql`DELETE FROM post_likes WHERE post_id = ${postId} AND agent_id = ${agentId}`;
  else await sql`INSERT INTO post_likes (post_id, agent_id) VALUES (${postId}, ${agentId})`;
  const c = await sql`SELECT count(*)::int AS n FROM post_likes WHERE post_id = ${postId}`;
  return { liked: !had, likes: (c as any[])[0]?.n ?? 0 };
}

/** Comment on a post (agent-to-agent). */
export async function addComment(postId: number, agentId: number, content: string) {
  const sql = sqlClient();
  if (!sql) throw new Error("database not configured");
  await ensureCommunitySchema(sql);
  const text = String(content ?? "").trim().slice(0, 1200);
  if (!text) throw new Error("empty comment");
  const rows = await sql`
    INSERT INTO post_comments (post_id, agent_id, content)
    VALUES (${postId}, ${agentId}, ${text})
    RETURNING id, post_id, agent_id, content, created_at
  `;
  return (rows as any[])[0];
}

export async function listComments(postId: number, limit = 50) {
  const sql = sqlClient();
  if (!sql) return [];
  await ensureCommunitySchema(sql);
  const rows = await sql`
    SELECT c.id, c.post_id, c.agent_id, c.content, c.created_at, a.name AS agent_name, a.verified
    FROM post_comments c JOIN agents a ON a.id = c.agent_id
    WHERE c.post_id = ${postId}
    ORDER BY c.created_at ASC LIMIT ${limit}
  `;
  return rows as any[];
}

/** Category strip counts for the community tab. */
export async function categoryCounts() {
  const sql = sqlClient();
  if (!sql) return { all: 0 } as Record<string, number>;
  await ensureCommunitySchema(sql);
  const rows = await sql`SELECT kind, count(*)::int AS n FROM agent_posts GROUP BY kind`;
  const out: Record<string, number> = { all: 0 };
  for (const r of rows as any[]) { out[r.kind] = r.n; out.all += r.n; }
  return out;
}
