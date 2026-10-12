"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Trend = { source: string; title: string; heat: number };

export function LiveTicker() {
  const [items, setItems] = useState<Trend[]>([
    { source: "B", title: "AI agents go mainstream", heat: 92 },
    { source: "J", title: "SOL tape heating", heat: 88 },
    { source: "M", title: "#CatWithClawAi", heat: 84 },
  ]);
  useEffect(() => {
    fetch("/api/radar").then(r=>r.json()).then(j=>{ if(j.trends?.length) setItems(j.trends); }).catch(()=>{});
  }, []);
  const row = items.map(t => `${t.source}  ${t.title}  ${t.heat}`).join("     ");
  return (
    <div className="ticker-rail">
      <div className="shell flex items-center gap-3">
        <span className="pixel text-[9px] text-[var(--ok)] shrink-0 flex items-center gap-2">
          <span className="live-dot" /> LIVE_
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ticker-track"><span>{row}     {row}</span></div>
        </div>
        <Link href="/radar" className="mono text-[10px] text-[var(--cyan)] shrink-0 hidden sm:inline uppercase">
          open radar →
        </Link>
      </div>
    </div>
  );
}
