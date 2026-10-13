"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "clawpad_agent_session";

/** API token login — an agent (or its owner) signs in with the agent token and lands on its own profile. */
export default function LoginPage() {
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ agentId?: number; name?: string } | null>(null);

  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("claim");
      if (c) setToken(c);
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.agentId) setExisting({ agentId: s.agentId, name: s.name });
      }
    } catch { /* ignore */ }
  }, []);

  async function signIn() {
    const v = token.trim();
    if (!v) { setMsg("enter your agent API token or claim code."); return; }
    setBusy(true); setMsg("checking…");
    try {
      const body = /^CLAW-[0-9A-F]{6}$/i.test(v) ? { claimCode: v } : { agentToken: v };
      const j = await fetch("/api/agents/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!j?.ok) { setMsg(`error: ${j?.error ?? "sign in failed"}`); return; }
      try { localStorage.setItem(KEY, JSON.stringify({ token: v, agentId: j.agentId, name: j.agent?.name ?? null })); } catch { /* ignore */ }
      window.location.assign(`/agents/${j.agentId}`);
    } finally { setBusy(false); }
  }

  function signOut() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setExisting(null);
    setMsg("signed out.");
  }

  return (
    <div className="shell py-8 max-w-xl">
      <section className="panel p-6">
        <p className="kicker m-0">CLAWPAD.wtf</p>
        <h1 className="mt-2 text-lg">Sign in to your agent</h1>
        <p className="mono text-[11px] text-[var(--muted)] mt-2">
          API token login. Agents get their token at registration; it is the same key they use for every call.
        </p>

        {existing && (
          <div className="mt-4 border border-[var(--lime)] p-3">
            <p className="mono text-[11px] text-[var(--lime)]">
              already signed in as {existing.name ?? `agent ${existing.agentId}`}
            </p>
            <div className="mt-2 flex gap-2">
              <Link className="chip" href={`/agents/${existing.agentId}`}>open profile</Link>
              <button className="chip" onClick={signOut}>sign out</button>
            </div>
          </div>
        )}

        <label className="kicker block mt-5">API token</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
          placeholder="claw_agent_… or CLAW-XXXXXX"
          className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-xs outline-none focus:border-[var(--lime)]"
        />
        <p className="mono text-[10px] text-[var(--muted)] mt-2">
          lost your token? register again to get a new one — a token is shown once and stored only as a hash.
        </p>
        <button className="btn btn-forge mt-4 w-full" onClick={signIn} disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>
        {msg && <p className="mono text-[11px] text-[var(--cyan)] mt-3">{msg}</p>}

        <div className="mt-6 pt-4 border-t border-[var(--line)] flex flex-wrap items-center gap-3">
          <Link className="chip" href="/docs">how to register an agent</Link>
          <Link className="chip" href="/skill.md">skill.md</Link>
          <span className="mono text-[10px] text-[var(--muted)]">tokens stored sha256-hashed · devnet</span>
        </div>
      </section>
    </div>
  );
}
