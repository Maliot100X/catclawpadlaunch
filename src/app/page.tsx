"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [trends, setTrends] = useState<{source:string;title:string;heat:number}[]>([]);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("auto");
  const [forged, setForged] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [forgedCount, setForgedCount] = useState<number|null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/radar").then(r=>r.json()).then(j=>setTrends(j.trends ?? [])).catch(()=>{});
    fetch("/api/coins").then(r=>r.json()).then(j=>{
      setForgedCount(j.total ?? null);
      setRecent((j.coins ?? []).slice(0,5));
    }).catch(()=>{});
  }, []);

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
          <h1 className="h-pixel">
            ANYTHING VIRAL
            <br />BECOMES A COIN.
          </h1>
          <p className="mt-6 max-w-md text-[var(--muted)] text-[15px]">
            A prompt, a post on X, a hashtag, a picture, a TikTok, or whatever the world is
            googling right now. The AI names it, writes the lore, draws the logo and you
            launch in one click. You only add the socials.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/forge" className="btn btn-forge">try it free →</Link>
            <Link href="/radar" className="btn">trend radar</Link>
          </div>
          <p className="mt-4 mono text-[11px] text-[var(--muted)] uppercase tracking-wider">
            no wallet needed to forge · wallet only to launch
          </p>
          <div className="mt-8 grid gap-2 mono text-[11px]">
            {[
              ["coins forged", forgedCount != null ? String(forgedCount) : "—", "on-chain + simulated"],
              ["trends tracked", String(trends.length), "sources online"],
              ["radar", "OFF", "0 scans · live wallet"],
              ["network", "SOL", "pump.fun · devnet"],
            ].map(([k,v,s])=>(
              <div key={k} className="flex gap-3 border border-[var(--line)] bg-[#04050c] px-3 py-2">
                <span className="text-[var(--muted)] w-28">{k}</span>
                <span className="text-[var(--lime)] w-12">{v}</span>
                <span className="text-[var(--muted)]">{s}</span>
              </div>
            ))}
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
              <p className="kicker">what you get · forged {forged.source} · {forged.logoModel === "flux.1-schnell" ? "FLUX real image" : (forged.logoNote ?? "procedural")}</p>
              <div className="mt-3 grid gap-3 grid-cols-[90px_1fr] items-start">
                {forged.logoUrl ? (
                  <img src={forged.logoUrl} alt={`${forged.name} logo`} className="border border-[var(--line)] aspect-square w-full object-cover" />
                ) : (
                  <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-[10px] text-[var(--muted)]">
                    {forged.logoStyle} logo
                  </div>
                )}
                <div>
                  <input value={forged.name} onChange={e=>setForged({...forged, name: e.target.value})} className="w-full bg-transparent border-b border-[var(--line)] font-bold focus:border-[var(--lime)] outline-none" />
                  <input value={forged.ticker} onChange={e=>setForged({...forged, ticker: e.target.value})} className="w-full bg-transparent border-b border-[var(--line)] mono text-[var(--lime)] text-sm focus:border-[var(--lime)] outline-none" />
                  <textarea value={forged.description} onChange={e=>setForged({...forged, description: e.target.value})} rows={3} className="mt-2 w-full bg-transparent text-xs text-[var(--muted)] border border-[var(--line)] p-2 focus:border-[var(--lime)] outline-none" />
                  <button className="chip mt-2" onClick={forgeNow}>↻ regenerate logo</button>
                  <Link href="/forge" className="btn mt-3 inline-block">edit + launch →</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* recent launches */}
      <section>
        <div className="flex items-baseline justify-between">
          <p className="k">// live from the launchpad</p>
          <Link href="/coins" className="mono text-[11px] text-[var(--cyan)]">all →</Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {recent.length === 0 && (
            <div className="panel p-4 mono text-xs text-[var(--muted)]">no launches yet — forge the first one</div>
          )}
          {recent.map((c)=>(
            <Link key={c.id} href={`/coin/${c.mint ?? c.id}`} className="panel p-3 hover:border-[var(--lime)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{c.name}</span>
                <span className="mono text-[var(--lime)] text-xs">{c.ticker}</span>
              </div>
              <div className="mono text-[10px] text-[var(--muted)] mt-1">{c.source ?? "forge"} · {c.when ?? ""}</div>
            </Link>
          ))}
        </div>
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

      {/* Footer disclaimer */}
      <section className="border-t border-[var(--line)] pt-6 pb-10 mono text-[11px] text-[var(--muted)]">
        CATCLAWPAD · meme coins are extremely high risk. this tool automates token creation;
        it does not give financial advice. launch responsibly and only with funds you can afford to lose.
      </section>
    </div>
  );
}
