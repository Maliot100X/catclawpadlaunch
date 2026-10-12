"use client";
import { use, useEffect, useState } from "react";

export default function CoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [coin, setCoin] = useState<any>(null);

  useEffect(() => {
    fetch("/api/coins").then(r=>r.json()).then(j=>{
      const c = (j.coins ?? []).find((x:any)=>String(x.id)===id || x.mint===id);
      setCoin(c ?? null);
    }).catch(()=>{});
  }, [id]);

  if (!coin) return <div className="panel p-6 mono text-sm text-[var(--muted)]">coin not found · {id}</div>;

  return (
    <div className="space-y-8">
      <div className="panel p-6 grid gap-6 md:grid-cols-[160px_1fr] items-start">
        <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-xs text-[var(--muted)]">
          {coin.logoStyle} logo
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold">{coin.name}</h2>
            <span className="mono text-[var(--lime)] text-lg">{coin.ticker}</span>
            <span className={`chip ${coin.status==="LIVE"?"chip-on":""}`}>{coin.status}</span>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)] max-w-xl">{coin.description}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(coin.tags ?? []).map((t:string)=><span key={t} className="chip">{t}</span>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {coin.mint && (
              <>
                <a className="btn btn-forge" href={`https://pump.fun/coin/${coin.mint}`} target="_blank" rel="noreferrer">pump.fun ↗</a>
                <a className="btn" href={`https://solscan.io/tx/${coin.mint}`} target="_blank" rel="noreferrer">solscan ↗</a>
              </>
            )}
            <span className="mono text-[11px] text-[var(--muted)] self-center">{coin.source} · {coin.when}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
