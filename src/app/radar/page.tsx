"use client";
import { useEffect, useState } from "react";

type Trend = { source: string; title: string; heat: number; kind: string; url?: string };

type HotTok = { mint: string; symbol?: string; name?: string; marketCapUsd?: number; volumeUsd?: number; change?: number | null; score?: number; url?: string };
type Launch = { mint: string; name?: string; symbol?: string; ageMinutes?: number; marketCapUsd?: number; bondingProgressPct?: number; graduated?: boolean; url?: string };
type Whale = { wallet: string; solMoved: number; txHash?: string; ts?: number };

export default function RadarPage() {
  const [status, setStatus] = useState("IDLE");
  const [trends, setTrends] = useState<Trend[]>([]);
  const [hot, setHot] = useState<HotTok[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [whales, setWhales] = useState<Whale[]>([]);
  const [whaleSignal, setWhaleSignal] = useState<string>("");
  const [symInput, setSymInput] = useState("CATCLAW,PEPE");
  const [symbols, setSymbols] = useState<any[]>([]);
  const [walletInput, setWalletInput] = useState("");
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [airdrops, setAirdrops] = useState<any>(null);
  const [threeMsg, setThreeMsg] = useState("");
  const [log, setLog] = useState<string[]>(["radar initialised · sim mode · no wallet"]);
  const [running, setRunning] = useState(false);
  const [interval_, setInterval_] = useState(60);
  const [maxCoins, setMaxCoins] = useState(3);
  const [budget, setBudget] = useState(1);
  const [devBuy, setDevBuy] = useState(0.01);
  const [minHeat, setMinHeat] = useState(35);
  const [saved, setSaved] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function scanNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan" }) });
      const j = await r.json();
      setStatus(j.status ?? "IDLE");
      setTrends(j.trends ?? []);
      setLog((L) => [`${new Date().toLocaleTimeString()} · scan ok · ${j.trends?.length ?? 0} topics · ${j.sources?.online ?? 0}/4 sources · hottest ${(j.trends ?? [])[0]?.title ?? "—"}`, ...L].slice(0, 20));
      setCounts(j.counts ?? {});
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { scanNow().catch(()=>{}); }, []);

  async function checkSymbols() {
    setThreeMsg("checking tickers…");
    const j = await fetch(`/api/three?kind=symbol&symbols=${encodeURIComponent(symInput)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setSymbols(j?.data?.results ?? []);
    setThreeMsg(j?.ok ? "ticker check done" : `error: ${j?.error ?? j?.upstreamStatus}`);
  }

  async function scanWallet() {
    if (!walletInput.trim()) { setThreeMsg("paste a wallet address"); return; }
    setThreeMsg("scanning wallet…");
    const [w, pf, ad] = await Promise.all([
      fetch(`/api/three?kind=wallet&address=${encodeURIComponent(walletInput)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/three?kind=portfolio&address=${encodeURIComponent(walletInput)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/three?kind=airdrops&address=${encodeURIComponent(walletInput)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    setWalletInfo(w?.data ?? null);
    setPortfolio(pf?.data ?? null);
    setAirdrops(ad?.data ?? null);
    setThreeMsg("wallet scanned");
  }

  async function threeify(prompt: string) {
    setThreeMsg(`queueing 3D build: ${prompt.slice(0, 40)}…`);
    const j = await fetch("/api/three3d?kind=generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
    }).then((r) => r.json()).catch(() => null);
    setThreeMsg(j?.ok ? `job #${j.job} queued → open 3D FORGE to watch it build` : `error: ${j?.error}`);
  }

  // real market intelligence from three.ws (keyless)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [t, l, w] = await Promise.all([
          fetch("/api/three?kind=trending&window=1h&limit=12", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/three?kind=launches&limit=12", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/three?kind=whales&minSol=5", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        if (t?.ok && Array.isArray(t.data?.tokens)) setHot(t.data.tokens);
        if (l?.ok && Array.isArray(l.data?.launches)) setLaunches(l.data.launches);
        if (w?.ok && w.data) { setWhales(Array.isArray(w.data.whales) ? w.data.whales : []); setWhaleSignal(String(w.data.signal ?? "")); }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

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
            {[["G","Google"],["B","Bluesky"],["M","Mastodon"],["R","Reddit"]].map(([k,label])=>{
              const n = counts[k] ?? 0;
              return <span key={k} className={`chip ${n>0?"chip-on":""}`}>{k} {label}{n>0?` ${n}`:""}</span>;
            })}
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
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noreferrer" className="text-xs flex-1 truncate hover:text-[var(--lime)]">{t.title}</a>
                ) : (
                  <span className="text-xs flex-1 truncate">{t.title}</span>
                )}
                <span className="mono text-[10px] text-[var(--cyan)]">{t.heat}</span>
              </div>
            ))}
            {trends.length===0 && <div className="mono text-[11px] text-[var(--muted)]">no topics yet — scan now</div>}
          </div>
        </div>
      </div>

      {/* real market intelligence · three.ws */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <p className="kicker">trending tokens · 1h · three.ws</p>
          <div className="mt-3 space-y-1 max-h-72 overflow-y-auto mono text-[11px]">
            {hot.length === 0 && <div className="text-[var(--muted)]">loading live momentum…</div>}
            {hot.map((t) => (
              <div key={t.mint} className="flex items-center gap-2 border-b border-[var(--line)] pb-1">
                <a href={`/coin/${t.mint}`} className="text-[var(--lime)] w-14 truncate">{t.symbol ?? "?"}</a>
                <a href={`/coin/${t.mint}`} className="flex-1 truncate text-[var(--muted)] hover:text-[var(--fg)]">{t.name}</a>
                <span className="text-[var(--cyan)]">{t.marketCapUsd ? `$${(t.marketCapUsd / 1e6).toFixed(2)}M` : "—"}</span>
                <span className="text-[var(--muted)]">score {t.score != null ? Number(t.score).toFixed(0) : "—"}</span>
                <button className="text-[var(--cyan)] hover:text-[var(--lime)]" title="build a 3D asset from this trend"
                        onClick={() => threeify(`a chunky collectible 3D figurine of ${t.name} (${t.symbol}) crypto meme mascot`)}>3D</button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <p className="kicker">fresh launches · live curve</p>
          <div className="mt-3 space-y-1 max-h-72 overflow-y-auto mono text-[11px]">
            {launches.length === 0 && <div className="text-[var(--muted)]">loading launches…</div>}
            {launches.map((l) => (
              <a key={l.mint} href={`/coin/${l.mint}`} className="flex items-center gap-2 border-b border-[var(--line)] pb-1 hover:opacity-80">
                <span className="text-[var(--lime)] w-14 truncate">{l.symbol ?? "?"}</span>
                <span className="flex-1 truncate text-[var(--muted)]">{l.name}</span>
                <span className="text-[var(--muted)]">{l.ageMinutes != null ? `${l.ageMinutes}m` : ""}</span>
                <span className={l.graduated ? "text-[var(--lime)]" : "text-[var(--cyan)]"}>
                  {l.graduated ? "GRAD" : `${l.bondingProgressPct != null ? Number(l.bondingProgressPct).toFixed(1) : "0"}%`}
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <p className="kicker" >whale flow · min 5 SOL</p>
          <div className="mt-3 space-y-1 max-h-72 overflow-y-auto mono text-[11px]">
            <div className="text-[var(--muted)]">signal: <span className={whaleSignal === "bullish" ? "text-[var(--lime)]" : "text-[var(--cyan)]"}>{whaleSignal || "neutral"}</span></div>
            {whales.length === 0 && <div className="text-[var(--muted)]">no large buys in the last window</div>}
            {whales.map((w, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-[var(--line)] pb-1">
                <span className="text-[var(--lime)]">{Number(w.solMoved).toFixed(1)} SOL</span>
                <span className="flex-1 truncate text-[var(--muted)]">{String(w.wallet).slice(0, 10)}…</span>
                {w.txHash && <a className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${w.txHash}`}>tx ↗</a>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* three.ws utilities */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <p className="kicker m-0">ticker availability · three.ws</p>
          <div className="mt-2 flex gap-2">
            <input value={symInput} onChange={(e) => setSymInput(e.target.value)}
                   className="flex-1 bg-[#04050c] border border-[var(--line)] p-2 mono text-xs outline-none focus:border-[var(--lime)]" />
            <button className="chip" onClick={checkSymbols}>check</button>
          </div>
          <div className="mt-3 space-y-1 mono text-[11px]">
            {symbols.length === 0 && <div className="text-[var(--muted)]">check a ticker before you launch it</div>}
            {symbols.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={r.available ? "text-[var(--lime)]" : "text-[#ff6b9d]"}>{r.available ? "FREE" : "TAKEN"}</span>
                <span className="flex-1">{r.symbol}</span>
                <span className="text-[var(--muted)]">{r.exactCollisions} exact · {r.fuzzyCollisions} fuzzy</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <p className="kicker m-0">wallet scanner · three.ws</p>
          <div className="mt-2 flex gap-2">
            <input value={walletInput} onChange={(e) => setWalletInput(e.target.value)} placeholder="wallet address"
                   className="flex-1 bg-[#04050c] border border-[var(--line)] p-2 mono text-xs outline-none focus:border-[var(--lime)]" />
            <button className="chip" onClick={scanWallet}>scan</button>
          </div>
          <div className="mt-3 space-y-1 mono text-[11px]">
            {!walletInfo && <div className="text-[var(--muted)]">balances + portfolio shape, no key needed</div>}
            {walletInfo && (
              <>
                <div className="flex justify-between"><span className="text-[var(--muted)]">native</span><span>{Number(walletInfo.native?.amount ?? 0).toFixed(4)} SOL</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">tokens</span><span>{walletInfo.tokenCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">value</span><span className="text-[var(--lime)]">${Number(walletInfo.totalUsd ?? 0).toFixed(2)}</span></div>
              </>
            )}
            {portfolio && (
              <div className="flex justify-between"><span className="text-[var(--muted)]">24h</span>
                <span className={Number(portfolio.change24h?.pct ?? 0) >= 0 ? "text-[var(--lime)]" : "text-[#ff6b9d]"}>
                  {Number(portfolio.change24h?.pct ?? 0).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <p className="kicker m-0">airdrop eligibility · three.ws</p>
          <div className="mt-3 space-y-1 mono text-[11px]">
            {!airdrops && <div className="text-[var(--muted)]">scan a wallet to score it against the live registry</div>}
            {airdrops && (
              <>
                <div className="flex justify-between"><span className="text-[var(--muted)]">tracked</span><span>{airdrops.summary?.tracked ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">qualified</span><span className="text-[var(--lime)]">{airdrops.summary?.qualified ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">in progress</span><span className="text-[var(--cyan)]">{airdrops.summary?.in_progress ?? 0}</span></div>
                {(airdrops.opportunities ?? []).slice(0, 3).map((o: any, i: number) => (
                  <div key={i} className="text-[var(--muted)]">• {o.name} — {o.eligibility} ({o.score})</div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      {threeMsg && <p className="mono text-[11px] text-[var(--cyan)]">{threeMsg}</p>}
    </div>
  );
}
