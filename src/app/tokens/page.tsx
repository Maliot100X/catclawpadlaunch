"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TokensPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <p className="kicker">engine 01</p>
      <h2 className="text-xl font-bold">Model tokens</h2>
      <div className="panel p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-claw-muted text-xs">pools</div>
          <div className="text-2xl">{data?.pools ?? "…"}</div>
        </div>
        <div>
          <div className="text-claw-muted text-xs">staked $</div>
          <div className="text-2xl">{data?.staked_usd ?? 0}</div>
        </div>
        <div>
          <div className="text-claw-muted text-xs">stakers</div>
          <div className="text-2xl">{data?.stakers ?? 0}</div>
        </div>
        <div>
          <div className="text-claw-muted text-xs">printed</div>
          <div className="text-2xl">{data?.printed ?? 0}</div>
        </div>
      </div>
      <div className="flex gap-2 text-sm">
        <span className="border border-claw-cyan px-2 py-1 text-claw-cyan">all</span>
        <span className="border border-claw-border px-2 py-1 text-claw-muted">top</span>
        <span className="border border-claw-border px-2 py-1 text-claw-muted">new</span>
      </div>
      {(!data?.items || data.items.length === 0) && (
        <p className="text-claw-muted text-sm">No activity yet.</p>
      )}
      <ul className="space-y-2">
        {(data?.items || []).map((p: any) => (
          <li key={p.mint} className="panel p-3 text-sm">
            <span className="text-claw-cyan">{p.family}</span> · {p.mint}
          </li>
        ))}
      </ul>
      <Link className="btn-hot inline-block" href="/launch">
        + launch token
      </Link>
    </div>
  );
}
