"use client";

import { useState } from "react";

type ForgeResult = {
  name: string;
  ticker: string;
  description: string;
  tags: string[];
  logoStyle: string;
  source: string;
  brain?: string;
  logoUrl?: string | null;
  logoModel?: string;
  logoNote?: string;
};

const STYLES = ["auto","meme","cartoon","3d","realistic","anime","minimal","pixel"];
const EXAMPLES = [
  "a cat that refuses to pay taxes, in space",
  "gigachad pigeon running the Federal Reserve",
  "a frog that only trades at 3am",
  "toaster that wants to go to the moon",
];
const TRENDS = ["carrie season 2","NBA preseason begins","brewers schedule","penix injury"];

export default function ForgePage() {
  const [tab, setTab] = useState<"prompt"|"x"|"hashtag"|"image"|"tiktok"|"trends">("prompt");
  const [prompt, setPrompt] = useState("");
  const [xPost, setXPost] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [style, setStyle] = useState("auto");
  const [result, setResult] = useState<ForgeResult|null>(null);
  const [busy, setBusy] = useState(false);
  const [forged, setForged] = useState(false);
  const [socials, setSocials] = useState({ website: "", telegram: "", x: "" });
  const [devBuy, setDevBuy] = useState("0.01");

  const value = tab==="prompt" ? prompt : tab==="x" ? xPost : tab==="hashtag" ? hashtag : tab==="image" ? imageUrl : tiktok;
  const setValue = tab==="prompt" ? setPrompt : tab==="x" ? setXPost : tab==="hashtag" ? setHashtag : tab==="image" ? setImageUrl : setTiktok;
  const placeholder = tab==="prompt" ? "Describe the coin in one line. AI does the rest."
    : tab==="x" ? "Paste an X post link…" : tab==="hashtag" ? "#Hashtag"
    : tab==="image" ? "Paste image URL…" : "Paste TikTok link…";

  async function forgeNow(override?: { prompt?: string; trend?: string }) {
    setBusy(true); setForged(false);
    try {
      const r = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: override?.prompt ?? prompt, xPost, hashtag, imageUrl, tiktok,
          trend: override?.trend, style,
        }),
      });
      const j = await r.json();
      setResult(j.coin ?? j);
    } finally { setBusy(false); }
  }

  function random() {
    const ex = EXAMPLES[Math.floor(Math.random()*EXAMPLES.length)];
    setPrompt(ex);
    forgeNow({ prompt: ex });
  }

  async function record(dry: boolean) {
    if (!result) return;
    setBusy(true);
    try {
      await fetch("/api/coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin: { ...result, source: result.source, devBuy, dryRun: dry, socials } }),
      });
      setForged(true);
    } finally { setBusy(false); }
  }

  const realBrain = result?.brain === "river-deepseek";

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">forge</p>
        <h2 className="text-2xl font-bold tracking-tight">ANYTHING VIRAL BECOMES A COIN.</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          A prompt, a post on X, a hashtag, a picture, a TikTok, or whatever the world is googling
          right now. The AI names it, writes the lore, draws the logo and you launch in one click.
          You only add the socials.
        </p>
      </div>

      <div className="panel p-4 md:p-6">
        <div className="flex flex-wrap gap-1">
          {([
            ["prompt","✦ Prompt"],["x","𝕏 X post"],["hashtag","# Hashtag"],["image","▣ Image"],["tiktok","♪ TikTok"],["trends","▲ Trends"]
          ] as const).map(([id,label])=>(
            <button key={id} type="button" onClick={()=>setTab(id)}
              className={`chip ${tab===id?"chip-on":""}`}>{label}</button>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="kicker">input · {tab}</p>
            <button className="chip" onClick={random}>[?] random</button>
          </div>
          {tab==="trends" ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {TRENDS.map(t=>(
                <button key={t} type="button" className="chip" onClick={()=>forgeNow({trend:t})}>{t}</button>
              ))}
            </div>
          ) : (
            <input
              value={value}
              onChange={e=>setValue(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==="Enter" && value.trim()) forgeNow(); }}
              placeholder={placeholder}
              className="mt-2 w-full bg-[#04050c] border border-[var(--line)] p-3 text-sm mono outline-none focus:border-[var(--lime)]"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="kicker mr-1">logo style</p>
          {STYLES.map(s=>(
            <button key={s} type="button" onClick={()=>setStyle(s)}
              className={`chip ${style===s?"chip-on":""}`}>{s}</button>
          ))}
          <button type="button" className="btn btn-forge ml-auto" disabled={busy}
            onClick={()=>forgeNow()}>
            {busy ? "forging…" : "forge coin"}
          </button>
        </div>

        {tab==="prompt" && !prompt && (
          <div className="mt-3 flex flex-wrap gap-1">
            {EXAMPLES.map(ex=>(
              <button key={ex} type="button" className="chip" onClick={()=>setPrompt(ex)}>{ex}</button>
            ))}
          </div>
        )}
      </div>

      {result && (
        <div className="panel p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kicker">coin preview · editable · {realBrain ? "REAL BRAIN · River DeepSeek" : "DEMO BRAIN (fallback)"}</p>
            <span className="chip">{result.logoModel === "flux.1-schnell" ? "logo: FLUX real" : "logo: procedural"}</span>
          </div>
          {!realBrain && (
            <p className="mt-2 mono text-[10px] text-[var(--muted)] border border-[var(--line)] p-2">
              DEMO MODE: brain unreachable — name and lore generated locally. Real AI branding when River responds.
            </p>
          )}
          <div className="mt-4 grid gap-5 md:grid-cols-[170px_1fr] items-start">
            {result.logoUrl ? (
              <img src={result.logoUrl} alt="logo" className="border border-[var(--line)] aspect-square w-full object-cover" />
            ) : (
              <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-xs text-[var(--muted)]">
                {result.logoStyle} logo
              </div>
            )}
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <label className="block">
                  <span className="mono text-[10px] uppercase text-[var(--muted)]">name</span>
                  <input value={result.name} onChange={e=>setResult({...result, name: e.target.value})}
                    className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 text-sm font-bold outline-none focus:border-[var(--lime)]" />
                </label>
                <label className="block">
                  <span className="mono text-[10px] uppercase text-[var(--muted)]">ticker</span>
                  <input value={result.ticker} onChange={e=>setResult({...result, ticker: e.target.value.toUpperCase()})}
                    className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-sm text-[var(--lime)] outline-none focus:border-[var(--lime)]" />
                </label>
              </div>
              <label className="block">
                <span className="mono text-[10px] uppercase text-[var(--muted)]">description</span>
                <textarea value={result.description} onChange={e=>setResult({...result, description: e.target.value})} rows={3}
                  className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 text-xs text-[var(--muted)] outline-none focus:border-[var(--lime)]" />
              </label>
              <div className="flex flex-wrap gap-1">
                {(result.tags ?? []).map(t=><span key={t} className="chip">#{t}</span>)}
              </div>

              <div className="border-t border-[var(--line)] pt-3">
                <p className="kicker">socials · optional</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input placeholder="website" value={socials.website} onChange={e=>setSocials({...socials, website: e.target.value})}
                    className="bg-[#04050c] border border-[var(--line)] p-2 mono text-[11px] outline-none focus:border-[var(--lime)]" />
                  <input placeholder="t.me/…" value={socials.telegram} onChange={e=>setSocials({...socials, telegram: e.target.value})}
                    className="bg-[#04050c] border border-[var(--line)] p-2 mono text-[11px] outline-none focus:border-[var(--lime)]" />
                  <input placeholder="@x handle" value={socials.x} onChange={e=>setSocials({...socials, x: e.target.value})}
                    className="bg-[#04050c] border border-[var(--line)] p-2 mono text-[11px] outline-none focus:border-[var(--lime)]" />
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mono text-[10px] uppercase text-[var(--muted)]">dev buy (SOL)</span>
                  <input type="number" step="0.01" value={devBuy} onChange={e=>setDevBuy(e.target.value)}
                    className="mt-1 w-32 bg-[#04050c] border border-[var(--line)] p-2 mono text-sm outline-none focus:border-[var(--lime)]" />
                </label>
                <button className="btn" disabled={busy || forged} onClick={()=>record(true)}>
                  dry run — record without tx
                </button>
                <button className="btn btn-forge opacity-50 cursor-not-allowed" title="Phase 3: Phantom → IPFS → pump.fun devnet">
                  launch on pump.fun — phase 3
                </button>
              </div>
              {forged && <p className="mono text-[11px] text-[var(--lime)]">✓ recorded to LAUNCHED — see /coins</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
