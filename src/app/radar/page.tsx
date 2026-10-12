"use client";
import { useEffect, useState } from "react";

type Trend = { source: string; title: string; heat: number; kind: string };

export default function RadarPage() {
  const [status, setStatus] = useState("IDLE");
  const [trends, setTrends] = useState<Trend[]>([]);
  const [log, setLog] = useState<string[]>(["radar initialised · sim mode · no wallet"]);
  const [running, setRunning] = useState(false);
  const [interval_, setInterval_] = useState(60);
  const [maxCoins, setMaxCoins] = useState(3);
  const [budget, setBudget] = useState(1);
  const [devBuy, setDevBuy] = useState(0.01);
  const [minHeat, setMinHeat] = useState(35);
  const [saved, setSaved] = useState("");

  async function scanNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan" }) });
      const j = await r.json();
      setStatus(j.status ?? "IDLE");
      setTrends(j.trends ?? []);
      setLog((L) => [`${new Date().toLocaleTimeString()} · scan ok · ${j.trends?.length ?? 0} topics · hottest ${(j.trends ?? [])[0]?.title ?? "—"}`, ...L].slice(0, 20));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { scanNow().catch(()=>{}); }, []);

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">autonomous mode</p>
        <h2 className="text-2xl font-bold tracking-tight">TREND RADAR</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Scans trends on a timer, picks the hottest topics it has not seen yet, brands each one with AI.
          Without a configured radar wallet it runs in simulation mode: everything is generated and logged, nothing is sent on-chain.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="panel p-4">
          <p className="kicker">status</p>
          <div className="mt-1 text-xl font-bold mono">{running ? "SCANNING…" : status}</div>
          <div className="mono text-[10px] text-[var(--muted)] mt-1">radar {running ? "on" : "off"} · {trends.length} topics</div>
        </div>
        <div className="panel p-4">
          <p className="kicker">daily budget</p>
          <div className="mt-1 text-xl font-bold mono">0.000 / {budget} SOL</div>
          <div className="mono text-[10px] text-[var(--muted)] mt-1">0 launches today · resets 00:00 UTC · sim wallet</div>
        </div>
        <div className="panel p-4">
          <p className="kicker">sources</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="chip chip-on">G Google</span>
            <span className="chip chip-on">B Bluesky</span>
            <span className="chip chip-on">M Mastodon</span>
            <span className="chip">R Reddit</span>
          </div>
        </div>
        <div className="panel p-4">
          <p className="kicker">controls</p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-forge mono text-[10px]" onClick={scanNow} disabled={running}>
              {running ? "scanning…" : "scan now"}
            </button>
            <button className="btn mono text-[10px]" onClick={()=>setRunning(v=>!v)}>
              {running ? "stop radar" : "start radar"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <p className="kicker">settings</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <label className="mono text-[10px] text-[var(--muted)]">interval (sec)
            <input type="number" value={interval_} onChange={e=>setInterval_(+e.target.value)} className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs" />
          </label>
          <label className="mono text-[10px] text-[var(--muted)]">max coins per scan
            <input type="number" value={maxCoins} onChange={e=>setMaxCoins(+e.target.value)} className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs" />
          </label>
          <label className="mono text-[10px] text-[var(--muted)]">daily budget (SOL)
            <input type="number" step="0.1" value={budget} onChange={e=>setBudget(+e.target.value)} className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs" />
          </label>
          <label className="mono text-[10px] text-[var(--muted)]">dev buy per coin (SOL)
            <input type="number" step="0.01" value={devBuy} onChange={e=>setDevBuy(+e.target.value)} className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs" />
          </label>
          <label className="mono text-[10px] text-[var(--muted)]">min heat · {minHeat}
            <input type="range" min="0" max="99" value={minHeat} onChange={e=>setMinHeat(+e.target.value)} className="mt-2 w-full accent-[var(--lime)]" />
          </label>
        </div>
        <button className="btn mono text-[10px] mt-3" onClick={()=>setSaved(`saved ${new Date().toLocaleTimeString()} · sim mode`)}>save settings</button>
        {saved && <span className="mono text-[10px] text-[var(--lime)] ml-3">{saved}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="kicker">radar log</p>
          <div className="mt-3 mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
            {log.map((l,i)=>(
              <div key={i} className={i===0 ? "text-[var(--lime)]" : "text-[var(--muted)]"}>{l}</div>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <p className="kicker">hot right now</p>
          <div className="mt-3 space-y-2">
            {trends.map((t,i)=>(
              <div key={i} className="flex items-center gap-3 border border-[var(--line)] px-3 py-2 bg-[#04050c]">
                <span className="mono text-[10px] text-[var(--lime)] w-4">{t.source}</span>
                <span className="text-xs flex-1 truncate">{t.title}</span>
                <span className="mono text-[10px] text-[var(--cyan)]">{t.heat}</span>
              </div>
            ))}
            {trends.length===0 && <div className="mono text-[11px] text-[var(--muted)]">no topics yet — scan now</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
