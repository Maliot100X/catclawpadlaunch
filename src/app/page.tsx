"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function HomePage() {
  const [trends, setTrends] = useState<{source:string;title:string;heat:number;url?:string}[]>([]);
  const [srcInfo, setSrcInfo] = useState<{online?:number;counts?:Record<string,number>}>({});
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("auto");
  const [forged, setForged] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ total: 0, onChain: 0, sim: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [updated, setUpdated] = useState<string>("");

  const loadCoins = useCallback(() => {
    fetch("/api/coins").then(r=>r.json()).then(j=>{
      const coins = j.coins ?? [];
      setStats({
        total: (j.total ?? coins.length),
        onChain: coins.filter((c:any)=>c.status==="LIVE").length,
        sim: coins.filter((c:any)=>c.status!=="LIVE").length,
      });
      setRecent(coins.slice(0,5));
      setLatest(coins.slice(0,7));
      setUpdated(new Date().toLocaleTimeString());
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    fetch("/api/radar").then(r=>r.json()).then(j=>{
      setTrends(j.trends ?? []);
      setSrcInfo({ online: j.sources?.online, counts: j.counts });
    }).catch(()=>{});
    loadCoins();
    const t = setInterval(loadCoins, 30000); // launcher-style 30s refresh
    return () => clearInterval(t);
  }, [loadCoins]);

  async function forgeNow() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style }),
      });
      const j = await r.json();
      setForged(j.coin);
      // auto-record the forge like launcher's forged N/6 counter
      await fetch("/api/coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin: j.coin }),
      });
      loadCoins();
    } finally { setBusy(false); }
  }

  const tape = [...trends, ...trends];

  return (
    <div className="space-y-14">

      {/* LIVE_ ticker */}
      <div className="border-y border-[var(--line)] py-2 overflow-hidden whitespace-nowrap mono text-[11px]">
        <span className="text-[var(--lime)] mr-3">LIVE_</span>
        {tape.length === 0 && <span className="text-[var(--muted)]">connecting to radar…</span>}
        {tape.map((t,i)=>(
          <span key={i} className="mr-6">
            <span className="text-[var(--lime)]">{t.source}</span>{" "}
            <span className="text-[var(--muted)]">{t.title}</span>{" "}
            <span className="text-[var(--cyan)]">{t.heat}</span>
          </span>
        ))}
      </div>

      {/* HERO + FORGE */}
      <section className="grid gap-10 lg:grid-cols-2 items-start">
        <div>
          <p className="k mb-4">SOLANA · PUMP.FUN · AI-NATIVE</p>
          <h1 className="hero-title">
            ANYTHING VIRAL<br /><span className="grad-lime">BECOMES A COIN.</span>
          </h1>
          <p className="hero-sub mt-6 text-[15px]">
            A prompt, a post on X, a hashtag, a picture, a TikTok, or whatever the world is
            googling right now. The AI names it, writes the lore, draws the logo and you
            launch in one click — then it trades on our own devnet curve.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/forge" className="btn btn-forge">try it free →</Link>
            <Link href="/radar" className="btn">trend radar</Link>
          </div>
          <p className="mt-4 mono text-[11px] text-[var(--muted)] uppercase tracking-wider">
            no wallet needed to forge · wallet only to launch
          </p>
          <div className="mt-8 grid grid-cols-2 gap-2">
            <div className="stat"><div className="k">coins forged</div><div className="v">{stats.total}</div><div className="k">{stats.onChain} on-chain · {stats.sim} sim</div></div>
            <div className="stat"><div className="k">trends tracked</div><div className="v">{trends.length}</div><div className="k">{srcInfo.online ?? 0} sources online</div></div>
            <div className="stat"><div className="k">network</div><div className="v grad-lime">DEVNET</div><div className="k">real mints + real curve</div></div>
            <div className="stat"><div className="k">market</div><div className="v">LIVE</div><div className="k">buy / sell on-chain</div></div>
          </div>
        </div>

        {/* Forge widget */}
        <div className="panel p-4">
          <div className="flex flex-wrap gap-1">
            {["✦ Prompt","𝕏 X post","# Hashtag","▣ Image","♪ TikTok","▲ Trends"].map((t,i)=>(
              <span key={t} className={`chip ${i===0?"chip-on":""}`}>{t}</span>
            ))}
          </div>
          <p className="kicker mt-4">input · Prompt</p>
          <input
            value={prompt}
            onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") forgeNow(); }}
            placeholder="Describe the coin in one line. AI does the rest."
            className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-3 text-sm mono outline-none focus:border-[var(--lime)]"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {["a cat that refuses to pay taxes, in space","gigachad pigeon running the Federal Reserve","a frog that only trades at 3am","toaster that wants to go to the moon"].map(ex=>(
              <button key={ex} className="chip" onClick={()=>setPrompt(ex)}>{ex}</button>
            ))}
          </div>
          <p className="kicker mt-4">logo style</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {["auto","meme","cartoon","3D","realistic","anime","minimal","pixel"].map(s=>(
              <button key={s} className={`chip ${style===s.toLowerCase()?"chip-on":""}`} onClick={()=>setStyle(s.toLowerCase())}>{s}</button>
            ))}
            <button className="btn ml-auto btn-forge" disabled={busy} onClick={forgeNow}>{busy?"forging…":"forge coin"}</button>
          </div>

          {forged && (
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <p className="kicker">
                coin preview · {forged.brain === "river-deepseek" ? "REAL BRAIN" : "DEMO BRAIN"} · {forged.logoModel === "flux.1-schnell" ? "logo: FLUX real" : "logo: procedural"}
              </p>
              <div className="mt-3 grid gap-3 grid-cols-[90px_1fr] items-start">
                {forged.logoUrl ? (
                  <img src={forged.logoUrl} alt={`${forged.name} logo`} className="border border-[var(--line)] aspect-square w-full object-cover" />
                ) : (
                  <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-[10px] text-[var(--muted)]">
                    {forged.logoStyle} logo
                  </div>
                )}
                <div>
                  <input value={forged.name} onChange={e=>setForged({...forged, name: e.target.value})}
                    className="w-full bg-transparent border-b border-[var(--line)] font-bold focus:border-[var(--lime)] outline-none" />
                  <input value={forged.ticker} onChange={e=>setForged({...forged, ticker: e.target.value.toUpperCase()})}
                    className="w-full bg-transparent border-b border-[var(--line)] mono text-[var(--lime)] text-sm outline-none" />
                  <textarea value={forged.description} onChange={e=>setForged({...forged, description: e.target.value})} rows={3}
                    className="mt-2 w-full bg-transparent text-xs text-[var(--muted)] border border-[var(--line)] p-2 outline-none" />
                  <Link href="/forge" className="btn mt-3 inline-block">edit socials + launch →</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* HOT RIGHT NOW */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="kicker m-0">what the internet is on right now</p>
          <span className="chip chip-on">HOT RIGHT NOW</span>
          <span className="mono text-[10px] text-[var(--muted)]">LIVE · {updated || "…"}</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {[["G","Google"],["B","Bluesky"],["M","Mastodon"],["R","Reddit"]].map(([k,label])=>{
              const n = srcInfo.counts?.[k] ?? 0;
              return <span key={k} className={`chip ${n>0?"chip-on":""}`}>{k} {label}{n>0?` ${n}`:""}</span>;
            })}
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {trends.slice(0,6).map((t,i)=>(
            <div key={i} className="border border-[var(--line)] px-3 py-2 bg-[#04050c] flex items-center gap-2">
              <span className="mono text-[10px] text-[var(--lime)] w-4">{t.source}</span>
              <span className="text-xs flex-1 truncate">{t.title}</span>
              <span className="mono text-[10px] text-[var(--cyan)]">{t.heat}</span>
            </div>
          ))}
        </div>
:p      </section>

      {/* live from the launchpad */}
      <section>
        <div className="flex items-baseline justify-between">
          <p className="k">// live from the launchpad</p>
          <span className="mono text-[10px] text-[var(--muted)]">latest launches · refreshes every 30s · {updated}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((c)=>(
            <Link key={c.id} href={`/coin/${c.mint ?? c.id}`} className="panel p-3 hover:border-[var(--lime)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{c.name}</span>
                <span className="mono text-[var(--lime)] text-xs">{c.ticker}</span>
              </div>
              <div className="mono text-[10px] text-[var(--muted)] mt-1">
                {String(c.when).slice(0,10)} · {c.source ?? "forge"} · {c.status ?? "SIM"}
              </div>
            </Link>
          ))}
          {latest.length===0 && <div className="panel p-4 mono text-xs text-[var(--muted)]">no launches yet — forge the first one</div>}
        </div>
      </section>

      {/* platform token strip */}
      <section className="panel p-4 flex flex-wrap items-center gap-3">
        <span className="chip chip-on">LIVE</span>
        <span className="mono text-sm text-[var(--lime)]">$CLAW</span>
        <span className="text-xs text-[var(--muted)]">platform token · FEES → TREASURY → BUYBACK → BURN · 0.02 SOL per launch + 1% on buys</span>
        <Link href="/tokenomics" className="btn ml-auto mono text-[10px]">see the numbers →</Link>
      </section>

      {/* HOW 01-03 */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["01","FEED IT","Prompt, X link, hashtag, image, TikTok or a live trend. Any of them."],
          ["02","AI FORGES","Name, ticker, description, tags and a logo in the style that fits. Edit anything."],
          ["03","LAUNCH","Connect Phantom, sign once. Metadata goes to IPFS, token goes live on pump.fun."],
        ].map(([n,t,d])=>(
          <div key={n} className="card p-5">
            <div className="h-pixel text-sm text-[var(--lime)]">{n}</div>
            <div className="mt-2 font-bold uppercase tracking-wide">{t}</div>
            <p className="mt-2 text-xs text-[var(--muted)]">{d}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="border border-[var(--lime)] bg-[#04050c] p-8 text-center">
        <h2 className="h-pixel text-[16px] sm:text-[22px]">GO BRRR_</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/forge" className="btn btn-forge">+ FORGE TOKEN</Link>
          <Link href="/radar" className="btn">RADAR</Link>
          <Link href="/coins" className="btn">COINS</Link>
        </div>
      </section>

      <section className="border-t border-[var(--line)] pt-6 pb-10 mono text-[11px] text-[var(--muted)]">
        CATCLAWPAD · meme coins are extremely high risk. this tool automates token creation;
        it does not give financial advice. launch responsibly and only with funds you can afford to lose.
      </section>
    </div>
  );
}
