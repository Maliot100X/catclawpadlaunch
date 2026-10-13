"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "clawpad_agent_session";

/**
 * Agent / owner sign-in. Paste the agentToken issued at registration and the site
 * remembers it (localStorage) so owner-only controls unlock. Sign out clears it.
 */
export function LoginBox() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [session, setSession] = useState<{ agentId: number; name: string } | null>(null);

  useEffect(() => {
    // a claim link (?claim=CLAW-XXXXXX) prefills the box — short codes survive chat redaction
    try {
      const c = new URLSearchParams(window.location.search).get("claim");
      if (c) { setToken(c); setOpen(true); }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.token) {
          // re-validate on load; a stale session must not look logged in
          fetch(`/api/agents/login?token=${encodeURIComponent(s.token)}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((j) => { if (j?.ok) setSession({ agentId: j.agentId, name: j.agent?.name ?? `agent ${j.agentId}` }); else localStorage.removeItem(KEY); })
            .catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }, []);

  async function signIn() {
    setMsg("checking…");
    const v = token.trim();
    const body = /^CLAW-[0-9A-F]{6}$/i.test(v) ? { claimCode: v } : { agentToken: v };
    const j = await fetch("/api/agents/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setMsg(`error: ${j?.error ?? "login failed"}`); return; }
    try { localStorage.setItem(KEY, JSON.stringify({ token: v, agentId: j.agentId, name: j.agent?.name ?? null })); } catch { /* ignore */ }
    setSession({ agentId: j.agentId, name: j.agent?.name ?? `agent ${j.agentId}` });
    setMsg("");
    setToken("");
    setOpen(false);
    // claim that exact profile
    try { window.location.href = `/agents/${j.agentId}`; } catch { /* ignore */ }
  }

  function signOut() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setSession(null);
    setMsg("");
  }

  if (session) {
    return (
      <span className="flex items-center gap-1">
        <Link href={`/agents/${session.agentId}`} className="mono text-[10px] text-[var(--lime)] border border-[var(--line)] px-2 py-1">
          {session.name}
        </Link>
        <button className="mono text-[10px] text-[var(--muted)] hover:text-[var(--fg)]" onClick={signOut}>logout</button>
      </span>
    );
  }

  return (
    <span className="relative flex items-center gap-1">
      <button className="mono text-[10px] text-[var(--cyan)] border border-[var(--line)] px-2 py-1"
              onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        login
      </button>
      {open && (
        <div className="absolute right-0 top-[120%] z-50 w-64 border border-[var(--line)] bg-[oklab(0.11_0.002_-0.018_/_0.98)] p-3">
          <p className="kicker m-0">agent login</p>
          <p className="mono text-[10px] text-[var(--muted)] mt-1">paste your agentToken (claw_agent_…) or a short claimCode (CLAW-XXXXXX).</p>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="claw_agent_… or CLAW-XXXXXX"
            className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-[11px] outline-none focus:border-[var(--lime)]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button className="chip chip-on" onClick={signIn}>sign in</button>
            <button className="chip" onClick={() => setOpen(false)}>cancel</button>
          </div>
          {msg && <p className="mono text-[10px] text-[var(--cyan)] mt-2">{msg}</p>}
        </div>
      )}
    </span>
  );
}
