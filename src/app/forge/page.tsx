"use client";

import { useState } from "react";

type ForgeResult = {
  name: string;
  ticker: string;
  description: string;
  tags: string[];
  logoStyle: string;
  source: string;
};

const STYLES = ["auto","meme","cartoon","3d","realistic","anime","minimal","pixel"];

const EXAMPLES = [
  "a cat that refuses to pay taxes, in space",
  "gigachad pigeon running the Federal Reserve",
  "a frog that only trades at 3am",
  "toaster that wants to go to the moon",
];

export default function ForgePage() {
  const [tab, setTab] = useState<"prompt"|"x"|"hashtag"|"image"|"tiktok"|"trends">("prompt");
  const [prompt, setPrompt] = useState("");
  const [xPost, setXPost] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [trend, setTrend] = useState("");
  const [style, setStyle] = useState("auto");
  const [result, setResult] = useState<ForgeResult|null>(null);
  const [busy, setBusy] = useState(false);

  async function forgeNow(override?: Partial<{prompt:string;xPost:string;hashtag:string;trend:string}>) {
    setBusy(true);
    try {
      const r = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, xPost, hashtag, imageUrl, tiktok, trend, style, ...override }),
      });
      const j = await r.json();
      setResult(j.coin ?? j);
    } finally {
      setBusy(false);
    }
  }

  const value = tab==="prompt" ? prompt : tab==="x" ? xPost : tab==="hashtag" ? hashtag : tab==="image" ? imageUrl : tab==="tiktok" ? tiktok : trend;
  const setValue = tab==="prompt" ? setPrompt : tab==="x" ? setXPost : tab==="hashtag" ? setHashtag : tab==="image" ? setImageUrl : tab==="tiktok" ? setTiktok : setTrend;
  const placeholder = tab==="prompt" ? "Describe the coin in one line. AI does the rest." :
                      tab==="x" ? "Paste an X post link…" :
                      tab==="hashtag" ? "#Hashtag" :
                      tab==="image" ? "Paste image URL…" :
                      tab==="tiktok" ? "Paste TikTok link…" : "Pick a live trend →";

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
          <p className="kicker">input · {tab}</p>
          {tab==="trends" ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {["carrie season 2","pensix injury","NBA preseason begins","brewers schedule"].map(t=>(
                <button key={t} type="button" className="chip" onClick={()=>{setTrend(t); forgeNow({trend:t});}}>{t}</button>
              ))}
            </div>
          ) : (
            <input
              value={value}
              onChange={e=>setValue(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==="Enter" && value.trim()) forgeNow(); }}
              placeholder={placeholder}
              className="w-full bg-[#04050c] border border-[var(--line)] p-3 text-sm mono outline-none focus:border-[var(--lime)]"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="kicker mr-1">logo style</p>
          {STYLES.map(s=>(
            <button key={s} type="button" onClick={()=>setStyle(s)}
              className={`chip ${style===s?"chip-on":""}`}>{s}</button>
          ))}
          <button type="button" className="btn ml-auto" disabled={busy || (tab!=="trends" && !value.trim())}
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
          <p className="kicker">what you get · {result.source}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-[120px_1fr] items-start">
            <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-xs text-[var(--muted)]">
              {result.logoStyle} logo
            </div>
            <div>
              <div className="text-xl font-bold">{result.name} <span className="mono text-[var(--lime)]">{result.ticker}</span></div>
              <p className="mt-2 text-sm text-[var(--muted)] max-w-xl">{result.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {result.tags.map(t=><span key={t} className="chip">{t}</span>)}
              </div>
              <div className="mt-4 flex gap-2">
                <span className="btn btn-forge opacity-50 cursor-not-allowed">launch on pump.fun — phase 3</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
