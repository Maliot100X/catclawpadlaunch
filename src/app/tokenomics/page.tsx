"use client";
import { useEffect, useState } from "react";

export default function TokenomicsPage() {
  const [burn, setBurn] = useState<{ sol_fee:any; buyback:number; burn:number; txs:any[]; mint:string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/tokenomics").then(r=>r.json()).then(j=>{ if(j.ok) setBurn(j); else setErr(j.error ?? "unavailable"); }).catch(()=>setErr("unavailable"));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">platform token · devnet</p>
        <h2 className="text-2xl font-bold tracking-tight">$CLAW — FEES → TREASURY → BUYBACK → BURN</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          0.02 SOL per launch and 1% on buys. All net revenue buys back $CLAW and burns it.
          Devnet simulation now — live on-chain burn stats after mainnet switch.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="kicker">fees collected</p>
          <div className="mt-1 text-2xl font-bold mono">{burn?.sol_fee ?? "0.00"} SOL</div>
        </div>
        <div className="panel p-5">
          <p className="kicker">buyback</p>
          <div className="mt-1 text-2xl font-bold mono text-[var(--cyan)]">{burn?.buyback ?? "0.0"} $CLAW</div>
        </div>
        <div className="panel p-5 border-[var(--lime)]">
          <p className="kicker">burned</p>
          <div className="mt-1 text-2xl font-bold mono text-[var(--lime)]">{burn?.burn ?? "0.0"} $CLAW</div>
        </div>
      </div>

      <div className="panel p-4">
        <p className="kicker">burn transactions</p>
        <div className="mt-3 mono text-[11px] space-y-1">
          {(burn?.txs ?? []).length === 0 && <div className="text-[var(--muted)]">no burn txs yet — devnet sim</div>}
          {(burn?.txs ?? []).map((t:any,i:number)=>(
            <div key={i} className="flex gap-3">
              <span className="text-[var(--muted)]">{String(t.when).slice(0,19)}</span>
              <span className="text-[var(--lime)]">{t.amount} $CLAW</span>
              {t.sig && <a className="text-[var(--cyan)]" href={`https://solscan.io/tx/${t.sig}?cluster=devnet`} target="_blank" rel="noreferrer">tx ↗</a>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["01","FEES","0.02 SOL per launch · 1% per buy routed to treasury."],
          ["02","BUYBACK","Treasury buys $CLAW on the open market — every cycle."],
          ["03","BURN","Bought $CLAW is burned. Supply only goes down."],
        ].map(([n,t,d])=>(
          <div key={n} className="card p-5">
            <div className="h-pixel text-sm text-[var(--lime)]">{n}</div>
            <div className="mt-2 font-bold uppercase tracking-wide">{t}</div>
            <p className="mt-2 text-xs text-[var(--muted)]">{d}</p>
          </div>
        ))}
      </div>

      {err && <div className="panel p-4 mono text-[11px] text-[var(--muted)]">stats unavailable · {err}</div>}
    </div>
  );
}
