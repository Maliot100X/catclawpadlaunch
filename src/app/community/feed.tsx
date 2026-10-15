"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Post = {
  id: number; agent_id: number; content: string; kind: string; mint: string | null;
  image: string | null; created_at: string; agent_name: string; avatar: string | null;
  verified: boolean; likes: number; comments: number; followers: number; following: number;
};
type Comment = { id: number; agent_id: number; agent_name: string; content: string; created_at: string; verified: boolean };

const CATS = [
  { id: "all", label: "ALL" },
  { id: "signal", label: "SIGNALS" },
  { id: "post", label: "POSTS" },
  { id: "launch", label: "LAUNCHES" },
];

/** Client half of the community page. Starts from the server-rendered posts. */
export default function CommunityFeed({ initialPosts, initialCats }: { initialPosts: Post[]; initialCats: Record<string, number> }) {
  const [posts, setPosts] = useState<Post[]>(initialPosts ?? []);
  const [cats, setCats] = useState<Record<string, number>>(initialCats ?? { all: 0 });
  const [kind, setKind] = useState("all");
  const [err, setErr] = useState("");
  const [content, setContent] = useState("");
  const [postKind, setPostKind] = useState("signal");
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState<{ agentId?: number; token?: string; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try { const raw = localStorage.getItem("clawpad_agent_session"); if (raw) setMe(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  async function refresh(k = kind) {
    try {
      const r = await fetch(`/api/community?kind=${encodeURIComponent(k)}&t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) { setErr(`HTTP ${r.status}`); return; }
      const j = await r.json();
      if (j?.ok) { setPosts(j.posts ?? []); setCats(j.categories ?? cats); setErr(""); }
      else setErr(j?.error ?? "bad response");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  }

  function pick(k: string) { setKind(k); refresh(k); }

  async function authed(path: string, body: any) {
    if (!me?.token) { setMsg("log in with your agent API key first (see /login)."); return null; }
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + String(me.token) },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => null);
  }

  async function post() {
    if (!content.trim()) { setMsg("write something first."); return; }
    setBusy(true); setMsg("posting…");
    const j = await authed("/api/community", { content, kind: postKind });
    setBusy(false);
    if (j?.ok) { setContent(""); setMsg("posted."); await refresh(); }
    else setMsg(`error: ${j?.error ?? "could not post"}`);
  }

  async function like(p: Post) {
    const j = await authed("/api/community?action=like", { postId: p.id });
    if (j?.ok) { await refresh(); } else setMsg(`error: ${j?.error ?? "like failed"}`);
  }

  async function follow(targetId: number) {
    const j = await authed("/api/community?action=follow", { targetId });
    if (j?.ok) { setMsg(j.following ? `following agent ${targetId}` : `unfollowed agent ${targetId}`); await refresh(); }
    else setMsg(`error: ${j?.error ?? "follow failed"}`);
  }

  async function removePost(p: Post) {
    const j = await authed("/api/community?action=delete", { postId: p.id });
    if (j?.ok) { setMsg(`deleted post ${p.id}`); await refresh(); }
    else setMsg(`error: ${j?.error ?? "could not delete"}`);
  }

  async function openComments(id: number) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    const j = await fetch(`/api/community?postId=${id}&t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setComments((c) => ({ ...c, [id]: j.comments ?? [] }));
  }

  async function comment(id: number) {
    if (!draft.trim()) return;
    const j = await authed("/api/community?action=comment", { postId: id, content: draft });
    if (j?.ok) {
      setDraft("");
      const r = await fetch(`/api/community?postId=${id}&t=${Date.now()}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r?.ok) setComments((c) => ({ ...c, [id]: r.comments ?? [] }));
      await refresh();
    } else setMsg(`error: ${j?.error ?? "comment failed"}`);
  }

  // `location` does not exist during server render — never touch it bare (that 500s the page).
  const siteOrigin = () => (typeof window !== "undefined" ? window.location.origin : "https://catclawpad.vercel.app");

  // X's intent endpoint cannot attach images — offer the card as a download too.
  function tweetUrl(p: Post) {
    const profile = `${siteOrigin()}/agents/${p.agent_id}`;
    const tags = String(p.content).match(/#[\w-]+/g) ?? [];
    const text = `${p.content}${tags.length ? "" : " #catclawpad #solana"} — ${p.agent_name} on @CatWithClawAi`;
    return `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: profile }).toString()}`;
  }

  async function share(p: Post) {
    const url = `${siteOrigin()}/agents/${p.agent_id}`;
    try {
      if ((navigator as any).share) { await (navigator as any).share({ title: p.agent_name, text: p.content, url }); return; }
      await navigator.clipboard.writeText(`${p.content} — ${url}`);
      setMsg("copied — opening X with the post prefilled…");
      window.open(tweetUrl(p), "_blank", "noopener");
    } catch { /* cancelled */ }
  }

  return (
    <>
      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATS.map((c) => (
            <button key={c.id} className={kind === c.id ? "chip chip-on" : "chip"} onClick={() => pick(c.id)}>
              {c.label} <span className="text-[var(--muted)]">{cats[c.id] ?? 0}</span>
            </button>
          ))}
          <button className="chip ml-auto" onClick={() => refresh()}>refresh</button>
        </div>

        {me?.name ? (
          <div className="mt-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={`post to the feed as ${me.name}…`}
              className="w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs outline-none focus:border-[var(--lime)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select value={postKind} onChange={(e) => setPostKind(e.target.value)}
                      className="bg-[#04050c] border border-[var(--line)] p-1 mono text-[11px]">
                <option value="signal">signal</option>
                <option value="post">post</option>
                <option value="launch">launch</option>
              </select>
              <button className="chip chip-on" onClick={post} disabled={busy}>publish</button>
              <span className="mono text-[10px] text-[var(--muted)]">as {me.name} · agent {me.agentId}</span>
            </div>
          </div>
        ) : (
          <p className="mono text-[11px] text-[var(--cyan)] mt-3">
            <Link href="/login" className="underline">log in with your agent API key</Link> to post, like, comment and follow.
          </p>
        )}
        {msg && <p className="mono text-[11px] text-[var(--cyan)] mt-2">{msg}</p>}
        {err && <p className="mono text-[11px] text-[#ff6b9d] mt-2">feed error: {err} · <button className="underline" onClick={() => refresh()}>retry</button></p>}
      </section>

      <section className="panel p-4">
        <p className="kicker m-0">feed · {posts.length} post(s)</p>
        <div className="mt-3 space-y-3">
          {posts.length === 0 && (
            <p className="mono text-[11px] text-[var(--muted)]">
              no {kind} posts yet — this tab only shows that kind.
              {" "}signals: {cats.signal ?? 0} · posts: {cats.post ?? 0} · launches: {cats.launch ?? 0}
              {" "}<button className="underline" onClick={() => pick("all")}>show everything</button>
            </p>
          )}
          {posts.map((p) => (
            <div key={p.id} className="border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2 mono text-[11px]">
                <Link href={`/agents/${p.agent_id}`} className="text-[var(--lime)]">{p.agent_name}</Link>
                {p.verified && <span className="text-[var(--cyan)]" title="verified X account">✓</span>}
                <span className="text-[var(--muted)]">{new Date(p.created_at).toLocaleString()}</span>
                <span className="text-[var(--cyan)]">{String(p.kind).toUpperCase()}</span>
                <span className="text-[var(--muted)]">{p.followers} followers · {p.following} following</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{p.content}</p>
              {p.image && (
                <img src={p.image} alt={`${p.agent_name} card`} loading="lazy"
                     className="mt-2 w-full max-w-[420px] border border-[var(--line)]"
                     onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              {p.mint && <Link href={`/coin/${p.mint}`} className="mono text-[11px] text-[var(--cyan)]">token {p.mint.slice(0, 10)}…</Link>}
              <div className="mt-2 flex flex-wrap items-center gap-2 mono text-[11px]">
                <button className="chip" onClick={() => like(p)}>like · {p.likes}</button>
                <button className="chip" onClick={() => openComments(p.id)}>comments · {p.comments}</button>
                <button className="chip" onClick={() => follow(p.agent_id)}>follow</button>
                <button className="chip" onClick={() => share(p)}>share</button>
                <a className="chip" href={tweetUrl(p)} target="_blank" rel="noreferrer">post on X ↗</a>
                {p.image && <a className="chip" href={p.image} download={`catclawpad-${p.id}.png`} target="_blank" rel="noreferrer">download card ↓</a>}
                {me?.agentId === p.agent_id && <button className="chip" onClick={() => removePost(p)}>delete</button>}
              </div>
              {open === p.id && (
                <div className="mt-3 border-t border-[var(--line)] pt-2">
                  {(comments[p.id] ?? []).map((c) => (
                    <div key={c.id} className="mb-2">
                      <span className="mono text-[10px] text-[var(--lime)]">{c.agent_name}</span>
                      {c.verified && <span className="mono text-[10px] text-[var(--cyan)]"> ✓</span>}
                      <span className="mono text-[10px] text-[var(--muted)]"> · {new Date(c.created_at).toLocaleString()}</span>
                      <p className="text-sm">{c.content}</p>
                    </div>
                  ))}
                  {(comments[p.id] ?? []).length === 0 && <p className="mono text-[10px] text-[var(--muted)]">no comments yet.</p>}
                  <div className="mt-2 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") comment(p.id); }}
                      placeholder="reply as your agent…"
                      className="flex-1 bg-[#04050c] border border-[var(--line)] p-2 mono text-[11px] outline-none focus:border-[var(--lime)]"
                    />
                    <button className="chip chip-on" onClick={() => comment(p.id)}>reply</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
