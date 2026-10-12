"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CoinsPage() {
  const [coins, setCoins] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/coins").then(r=>r.json()).then(j=>{
      setCoins(j.coins ?? []);
      setTotal(j.total ?? 0);
    }).catch(()=>{});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">launched coins</p>
        <h2 className="text-2xl font-bold">EVERY COIN FORGED WITH CATCLAWPAD.</h2>
        <p className="mt-2 mono text-[11px] text-[var(--muted)]">{total} forged · source, logo, ticker, pump.fun and solscan links.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {coins.length === 0 && <div className="panel p-4 mono text-xs text-[var(--muted)]">nothing forged yet — go forge the first</div>}
        {coins.map(c=>(
          <Link key={c.id} href={`/coin/${c.mint ?? c.id}`} className="panel p-3 hover:border-[var(--lime)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{c.name}</span>
              <span className="mono text-[var(--lime)] text-xs">{c.ticker}</span>
            </div>
            <div className="mono text-[10px] text-[var(--muted)] mt-1">
              {c.source ?? "forge"} · {c.status} · {String(c.when).slice(0,10)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
