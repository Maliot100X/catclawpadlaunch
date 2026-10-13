"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Agent = { id: number; name: string; strategy: string; personality: string | null; pubkey: string; status: string; budget_sol: number; created_at: string };
type Act = { id: number; kind: string; summary: string; signature: string | null; mint: string | null; fuel_sol: number | null; created_at: string };

const STRATEGIES = [
  { id: "launch-and-trade", label: "launch + trade", hint: "forges a coin then buys its own curve" },
  { id: "curve-sniper", label: "curve sniper", hint: "buys early on fresh curves" },
  { id: "dip-buyer", label: "dip buyer", hint: "buys weakness, sells strength" },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState(STRATEGIES[0].id);
  const [personality, setPersonality] = useState("cold, quantitative, slightly unhinged");
  const [fundSol, setFundSol] = useState("0.25");
  const [apiKey, setApiKey] = useState("");
  const [useOwnKey, setUseOwnKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [activity, setActivity] = useState<Act[]>([]);
  const [running, setRunning] = useState<number | null>(null);
  const [auto, setAuto] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<any>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setAgents(j.agents ?? []);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const j = await fetch(`/api/agents/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setActivity(j.activity ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (selected == null) return;
    loadDetail(selected);
    const t = setInterval(() => loadDetail(selected), 12000);
    return () => clearInterval(t);
  }, [selected, loadDetail]);

  // auto brain: run a cycle on an interval while enabled
  useEffect(() => {
    if (auto == null) return;
    const t = setInterval(() => { runCycle(auto).catch(() => {}); }, 45000);
    return () => clearInterval(t);
  }, [auto]);

  async function create() {
    if (!name.trim()) { setStatus("give the agent a name"); return; }
    setBusy(true); setStatus("creating wallet + funding from treasury…");
    try {
      const j = await fetch("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, strategy, personality, fundSol: Number(fundSol), apiKey: useOwnKey && apiKey ? apiKey : undefined }),
      }).then((r) => r.json());
      if (!j.ok) { setStatus(`error: ${j.error}`); return; }
      setStatus(`agent live · wallet ${j.pubkey.slice(0, 8)}… funded ${j.budgetSol} SOL`);
      setName(""); setApiKey("");
      await load();
      setSelected(j.id);
    } finally { setBusy(false); }
  }

  async function runCycle(id: number) {
    setRunning(id);
    try {
      const j = await fetch(`/api/agents/${id}`, { method: "POST" }).then((r) => r.json());
      setLastRun(j);
      if (selected === id) await loadDetail(id);
    } finally { setRunning(null); }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">autonomous trading agents · real devnet wallets</p>
        <h2 className="text-2xl font-bold tracking-tight">AGENTS_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-3xl">
          Every agent gets its own Solana devnet wallet, funded from the treasury. Give it a strategy and it
          thinks with the live brain, then <strong>actually</strong> launches tokens and buys/sells on our
          bonding curve — each action is a real, confirmed on-chain transaction. Leave the API key empty to use
          our brain.
        </p>
      </div>

      <section className="panel p-4 md:p-6 space-y-4">
        <p className="kicker m-0">create an agent</p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="kicker">name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claw Sniper"
                   className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
          </label>
          <label className="block">
            <span className="kicker">strategy</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
                    className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]">
              {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="kicker">starting budget (SOL)</span>
            <input value={fundSol} onChange={(e) => setFundSol(e.target.value)} type="number" step="0.05" min="0.05" max="2"
                   className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
          </label>
          <label className="block">
            <span className="kicker">personality</span>
            <input value={personality} onChange={(e) => setPersonality(e.target.value)}
                   className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="mono text-[11px] flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useOwnKey} onChange={(e) => setUseOwnKey(e.target.checked)} />
            use my own brain key (optional)
          </label>
          {useOwnKey && (
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-… (stored for this agent)"
                   className="flex-1 min-w-[220px] bg-[#04050c] border border-[var(--line)] p-2 mono text-xs outline-none focus:border-[var(--lime)]" />
          )}
          <button className="btn btn-forge ml-auto" disabled={busy} onClick={create}>{busy ? "creating…" : "CREATE AGENT"}</button>
        </div>
        {status && <p className="mono text-[11px] text-[var(--cyan)]">{status}</p>}
        <p className="mono text-[10px] text-[var(--muted)]">
          no key? the agent uses our live brain automatically. strategies: {STRATEGIES.map((s) => `${s.label} — ${s.hint}`).join(" · ")}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="space-y-2">
          <p className="kicker">{agents.length} agent(s)</p>
          {agents.length === 0 && <div className="panel p-4 mono text-xs text-[var(--muted)]">no agents yet — create the first one above</div>}
          {agents.map((a) => (
            <div key={a.id} className={`panel p-3 ${selected === a.id ? "border-[var(--lime)]" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="text-sm font-bold hover:text-[var(--lime)]" onClick={() => setSelected(a.id)}>{a.name}</button>
                <span className="chip">{a.strategy}</span>
                <span className={`chip ${a.status === "active" ? "chip-on" : ""}`}>{a.status}</span>
                <span className="mono text-[10px] text-[var(--muted)]">{a.budget_sol} SOL · {String(a.pubkey).slice(0, 6)}…</span>
                <div className="ml-auto flex gap-1">
                  <button className="chip" disabled={running === a.id} onClick={() => runCycle(a.id)}>
                    {running === a.id ? "thinking…" : "run cycle"}
                  </button>
                  <button className={`chip ${auto === a.id ? "chip-on" : ""}`} onClick={() => setAuto(auto === a.id ? null : a.id)}>
                    {auto === a.id ? "auto: on" : "auto: off"}
                  </button>
                  <a className="chip" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/address/${a.pubkey}?cluster=devnet`}>wallet ↗</a>
                </div>
              </div>
            </div>
          ))}

          {lastRun && (
            <div className="panel p-3 mono text-[11px] space-y-1">
              <p className="kicker m-0">last cycle · brain {lastRun.brain}</p>
              <div>action <span className="text-[var(--lime)]">{lastRun.action}</span> {lastRun.reason ? `· ${lastRun.reason}` : ""}</div>
              {lastRun.launched && <div>launched <Link className="text-[var(--cyan)] underline" href={`/coin/${lastRun.launched.mint}`}>{lastRun.launched.name} (${lastRun.launched.ticker})</Link></div>}
              {lastRun.trade && <div>trade <span className="text-[var(--cyan)]">{lastRun.trade.side}</span> · {lastRun.trade.signature?.slice(0, 16)}…</div>}
              {lastRun.error && <div className="text-[#ff6b9d]">error: {lastRun.error}</div>}
              <div className="text-[var(--muted)]">balance before {lastRun.balanceSol?.toFixed(4)} → after {lastRun.balanceAfterSol?.toFixed(4)} SOL</div>
            </div>
          )}
        </section>

        <section className="panel p-4">
          <p className="kicker">{selected ? `activity · agent #${selected}` : "activity"}</p>
          <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto">
            {!selected && <div className="mono text-[11px] text-[var(--muted)]">select an agent to see its real on-chain history</div>}
            {selected && activity.length === 0 && <div className="mono text-[11px] text-[var(--muted)]">no activity yet — hit “run cycle”</div>}
            {activity.map((x) => (
              <div key={x.id} className="border-b border-[var(--line)] pb-2">
                <div className="flex items-center gap-2 mono text-[11px]">
                  <span className={x.kind === "error" ? "text-[#ff6b9d]" : x.kind === "sell" ? "text-[#ff6b9d]" : "text-[var(--lime)]"}>{x.kind.toUpperCase()}</span>
                  <span className="text-[var(--muted)]">{new Date(x.created_at).toLocaleTimeString()}</span>
                  {x.signature && (
                    <a className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer"
                       href={`https://explorer.solana.com/tx/${x.signature}?cluster=devnet`}>tx ↗</a>
                  )}
                  {x.mint && <Link className="text-[var(--cyan)] underline" href={`/coin/${x.mint}`}>coin</Link>}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">{x.summary}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
