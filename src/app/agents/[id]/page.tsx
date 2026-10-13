"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Agent = { id: number; name: string; strategy: string; personality: string | null; pubkey: string; status: string; budget_sol: number; owner_wallet?: string | null; wallet_mode?: string; created_at: string };
type Act = { id: number; kind: string; summary: string; signature: string | null; mint: string | null; fuel_sol: number | null; created_at: string };

export default function AgentProfile() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [a, setA] = useState<Agent | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [rank, setRank] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState("");

  const load = useCallback(async () => {
    const j = await fetch(`/api/agents/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) { setA(j.agent); setActs(j.activity ?? []); }
    const lb = await fetch("/api/leaderboard", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (lb?.ok) setRank((lb.leaderboard ?? []).find((x: any) => String(x.id) === String(id)) ?? null);
    const av = await fetch(`/api/agents/${id}/avatar`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (av?.modelUrl) setModelUrl(av.modelUrl);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Register the three.ws viewer element through the bundler.
  useEffect(() => {
    import("@three-ws/avatar/viewer").catch(() => { /* optional */ });
  }, []);

  async function run() {
    setBusy(true); setMsg("agent is thinking…");
    try {
      const j = await fetch(`/api/agents/${id}`, { method: "POST" }).then((r) => r.json());
      setMsg(j?.ok ? `action: ${j.action} — ${j.reason ?? ""}` : `error: ${j?.error ?? j?.reason ?? "unknown"}`);
      await load();
    } finally { setBusy(false); }
  }

  // three.ws's own avatar stack: their creator iframe exports a real GLB, which we pin.
  async function buildAvatar() {
    setAvatarMsg("opening the three.ws avatar studio…");
    try {
      const mod: any = await import("@three-ws/avatar/creator");
      const AvatarCreator = mod.AvatarCreator ?? mod.default;
      const creator = new AvatarCreator({
        onExport: async (glbBlob: Blob) => {
          setAvatarMsg(`got a ${(glbBlob.size / 1024 / 1024).toFixed(1)} MB GLB from three.ws — pinning…`);
          const form = new FormData();
          form.append("file", glbBlob, `agent-${id}.glb`);
          const j = await fetch(`/api/agents/${id}/avatar`, { method: "PUT", body: form }).then((r) => r.json()).catch(() => null);
          if (j?.ok && j.modelUrl) { setModelUrl(j.modelUrl); setAvatarMsg(`avatar saved · ${(glbBlob.size / 1024 / 1024).toFixed(1)} MB real GLB on IPFS`); }
          else setAvatarMsg(`save failed: ${j?.error ?? "unknown"}`);
        },
      });
      await creator.open();
    } catch (e: any) {
      setAvatarMsg(`creator unavailable: ${e?.message ?? e} — use a hosted three.ws avatar instead`);
    }
  }

  async function attachThreeWs() {
    setAvatarMsg("attaching a hosted three.ws avatar…");
    const j = await fetch(`/api/agents/${id}/avatar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ src: "https://three.ws/avatars/default.glb" }),
    }).then((r) => r.json()).catch(() => null);
    if (j?.ok && j.modelUrl) { setModelUrl(j.modelUrl); setAvatarMsg("three.ws avatar attached"); }
    else setAvatarMsg(`error: ${j?.error ?? "could not attach"}`);
  }

  const trades = acts.filter((x) => x.kind === "buy" || x.kind === "sell");
  const launches = acts.filter((x) => x.kind === "launch");

  if (loading) return <div className="panel p-6 mono text-sm text-[var(--muted)]">loading agent {id}…</div>;
  if (!a) return (
    <div className="panel p-6 mono text-sm text-[var(--muted)]">
      agent not found — <Link className="text-[var(--cyan)] underline" href="/agents">back to agents</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="panel p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{a.name}</h1>
          <span className="chip">{a.strategy}</span>
          <span className={`chip ${a.status === "active" ? "chip-on" : ""}`}>{a.status}</span>
          {rank && <span className="chip chip-on">rank #{rank.rank} of the board</span>}
          <span className="chip">{a.wallet_mode === "external" ? "your wallet" : "platform wallet"}</span>
        </div>
        {a.personality && <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">{a.personality}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="stat"><div className="k">trades</div><div className="v">{rank?.trades ?? trades.length}</div><div className="k">{rank ? `${rank.buys} buy / ${rank.sells} sell` : ""}</div></div>
          <div className="stat"><div className="k">SOL traded</div><div className="v grad-lime">{Number(rank?.solVolume ?? 0).toFixed(3)}</div><div className="k">on-chain volume</div></div>
          <div className="stat"><div className="k">launched</div><div className="v">{rank?.launched ?? launches.length}</div><div className="k">tokens minted</div></div>
          <div className="stat"><div className="k">fuel</div><div className="v">{Number(a.budget_sol ?? 0).toFixed(2)}</div><div className="k">SOL from treasury</div></div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          <button className="chip chip-on" disabled={busy} onClick={run}>{busy ? "thinking…" : "run a cycle"}</button>
          <a className="chip" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/address/${a.pubkey}?cluster=devnet`}>agent wallet ↗</a>
          {a.owner_wallet && <a className="chip" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/address/${a.owner_wallet}?cluster=devnet`}>owner wallet ↗</a>}
          <Link className="chip" href="/agents">← all agents</Link>
          <Link className="chip" href="/leaderboard">leaderboard →</Link>
        </div>
        {msg && <p className="mono text-[11px] text-[var(--cyan)] mt-3">{msg}</p>}
        <p className="mono text-[10px] text-[var(--muted)] mt-2">
          agent wallet {a.pubkey} · created {new Date(a.created_at).toLocaleString()}
        </p>
      </section>

      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="kicker m-0">3d avatar · three.ws</p>
          <button className="chip chip-on" onClick={buildAvatar}>open three.ws avatar studio</button>
          <button className="chip" onClick={attachThreeWs}>use hosted three.ws avatar</button>
          {modelUrl && !modelUrl.startsWith("threews:") && <a className="chip" href={modelUrl} target="_blank" rel="noreferrer">download GLB ↗</a>}
        </div>
        {avatarMsg && <p className="mono text-[11px] text-[var(--cyan)] mt-2">{avatarMsg}</p>}
        {modelUrl ? (
          // @ts-expect-error three.ws custom element ("@three-ws/avatar/viewer" registers <three-ws-viewer>)
          <three-ws-viewer src={modelUrl} alt={`${a.name} 3D avatar`} background="transparent" ar
                           style={{ width: "100%", height: 340, background: "#04050c", border: "1px solid var(--line)", marginTop: 12, display: "block" }} />
        ) : (
          <p className="mono text-[11px] text-[var(--muted)] mt-2">
            no avatar yet — open the three.ws avatar studio (their creator, exported as a real GLB and pinned to IPFS), or attach a hosted three.ws avatar.
          </p>
        )}
      </section>

      <section className="panel p-4">
        <p className="kicker m-0">on-chain activity · {acts.length} event(s)</p>
        <div className="mt-3 space-y-2 max-h-[520px] overflow-y-auto">
          {acts.length === 0 && <div className="mono text-[11px] text-[var(--muted)]">nothing yet — run a cycle</div>}
          {acts.map((x) => (
            <div key={x.id} className="border-b border-[var(--line)] pb-2">
              <div className="flex flex-wrap items-center gap-2 mono text-[11px]">
                <span className={x.kind === "error" ? "text-[#ff6b9d]" : x.kind === "sell" ? "text-[#ff6b9d]" : "text-[var(--lime)]"}>{x.kind.toUpperCase()}</span>
                <span className="text-[var(--muted)]">{new Date(x.created_at).toLocaleString()}</span>
                {x.signature && (
                  <a className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer"
                     href={`https://explorer.solana.com/tx/${x.signature}?cluster=devnet`}>tx ↗</a>
                )}
                {x.mint && <Link className="text-[var(--cyan)] underline" href={`/coin/${x.mint}`}>coin</Link>}
                {x.fuel_sol != null && <span className="text-[var(--muted)]">{x.fuel_sol} SOL</span>}
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">{x.summary}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
