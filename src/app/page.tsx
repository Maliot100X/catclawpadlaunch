"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const MODELS = [
  { id: "claude", name: "claude sonnet 4", direct: 15, market: 9 },
  { id: "grok", name: "grok 4", direct: 15, market: 9 },
  { id: "gpt", name: "gpt-4o", direct: 10, market: 6 },
  { id: "gemini", name: "gemini 2.5 pro", direct: 10, market: 6 },
  { id: "deepseek", name: "deepseek v3.1", direct: 1, market: 0.6 },
];

export default function HomePage() {
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<"curl"|"python"|"node">("curl");
  const [live, setLive] = useState<any>(null);
  const m = MODELS[idx];
  const save = Math.round(((m.direct - m.market) / m.direct) * 100);

  useEffect(() => {
    fetch("/api/launch").then(r=>r.json()).then(setLive).catch(()=>{});
  }, []);

  const snip = {
    curl: `curl http://13.62.48.15:3100/api/public/v1/chat/completions \\\n  -H "Authorization: Bearer sk-claw-..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude","messages":[{"role":"user","content":"gm"}]}'`,
    python: `import requests\nrequests.post("http://13.62.48.15:3100/api/public/v1/chat/completions",\n  headers={"Authorization":"Bearer sk-claw-..."},\n  json={"model":"claude","messages":[{"role":"user","content":"gm"}]})`,
    node: `await fetch("/api/public/v1/chat/completions", {\n  method:"POST",\n  headers:{Authorization:"Bearer sk-claw-...","Content-Type":"application/json"},\n  body:JSON.stringify({model:"claude",messages:[{role:"user",content:"gm"}]})\n})`,
  };

  return (
    <div className="space-y-14">
      <section className="grid gap-8 lg:grid-cols-2 items-center">
        <div>
          <p className="k mb-4">SOLANA · PUMP.FUN · AI-NATIVE · LLM CREDITS</p>
          <h1 className="h-pixel">
            ANYTHING VIRAL
            <br />
            BECOMES
            <br />
            <span className="text-[var(--lime)]">INTELLIGENCE.</span>
          </h1>
          <p className="mt-6 max-w-md text-[var(--muted)] text-[15px]">
            A prompt, a trend, a model family. AI names it, brands it — you launch. Stake for LLM credits, trade on Jupiter, run agents. Wallet only to launch.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/launch" className="btn btn-forge">TRY IT FREE →</Link>
            <Link href="/radar" className="btn">TREND RADAR</Link>
            <Link href="/trade" className="btn btn-wallet" style={{borderRadius:0}}>TRADE</Link>
          </div>
          <p className="mt-4 mono text-[11px] text-[var(--muted)] uppercase tracking-wider">
            no wallet needed to forge · wallet only to launch
            {live?.authority_sol != null && <> · treasury {Number(live.authority_sol).toFixed(2)} SOL</>}
          </p>
        </div>
        <div className="border border-[var(--line)] bg-[#04050c] p-4 mono text-xs text-[var(--muted)]">forge preview · logo goes here · no 3d</div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["AI name + ticker + lore", "Forge brands model families like viral coins"],
          ["AI logo · meme / 3D", "Neural core preview on every launch"],
          ["Trend radar · auto heat", "Live tape + social heat → forge"],
          ["LLM credits + Jupiter", "sk-claw- API · real quotes · agents"],
        ].map(([t,d]) => (
          <div key={t} className="card p-4 border-[var(--line)]">
            <div className="font-semibold text-sm uppercase tracking-wide">{t}</div>
            <p className="mt-2 text-xs text-[var(--muted)]">{d}</p>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <p className="k">// llm pad layer // compare costs / 1M out</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {MODELS.map((row,i)=>(
            <button key={row.id} type="button" className={i===idx?"chip chip-on":"chip"} onClick={()=>setIdx(i)}>{row.name}</button>
          ))}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {[
            ["Direct", `$${m.direct.toFixed(2)}`],
            ["Claw market", `$${m.market.toFixed(2)}`],
            ["Staker", "$0.00"],
            ["You save", `${save}%`],
          ].map(([t,v],i)=>(
            <div key={t} className={`p-4 border border-[var(--line)] ${i===3?"bg-[var(--lime)] text-[#0a0b10]":"bg-[#04050c]"}`}>
              <div className={`text-[10px] uppercase tracking-wider ${i===3?"text-[#0a0b10]/70":"text-[var(--muted)]"}`}>{t}</div>
              <div className="mt-1 text-2xl font-bold mono">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <p className="k">// the api // one key. every model.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[["01","connect wallet"],["02","get llm credits"],["03","create sk-claw-"],["04","call any model"]].map(([n,t])=>(
            <div key={n} className="border border-[var(--line)] p-3 bg-[#04050c]">
              <div className="mono text-[10px] text-[var(--cyan)]">{n}</div>
              <div className="mt-1 text-sm font-semibold uppercase">{t}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/api" className="btn btn-forge">[GET KEY]</Link>
          {(["curl","python","node"] as const).map(t=>(
            <button key={t} type="button" className={tab===t?"chip chip-on":"chip"} onClick={()=>setTab(t)}>[{t}]</button>
          ))}
        </div>
        <pre className="mt-3 overflow-x-auto border border-[var(--line)] bg-[#04050c] p-4 mono text-[12px] text-[var(--muted)] whitespace-pre-wrap">{snip[tab]}</pre>
      </section>

      <section className="border border-[var(--lime)] bg-[#04050c] p-8 text-center">
        <h2 className="h-pixel text-[16px] sm:text-[22px]">GO BRRR_</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/launch" className="btn btn-forge">+ FORGE TOKEN</Link>
          <Link href="/radar" className="btn">RADAR</Link>
          <Link href="/agents" className="btn">AGENTS</Link>
          <Link href="/trade" className="btn btn-wallet">TRADE</Link>
        </div>
      </section>
    </div>
  );
}
