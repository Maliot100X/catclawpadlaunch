"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Trend = { source: string; title: string; heat: number; kind?: string };

export default function RadarPage() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const j = await fetch("/api/radar").then((r) => r.json());
      setData(j);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const trends: Trend[] = data?.trends || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="k">autonomous mode</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">
            TREND RADAR<span className="text-[var(--accent2)]">_</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Scans market heat + social/news signals, ranks topics, brands them for forge. Live mode can auto-launch when
            you wire radar wallet + budget (devnet first).
          </p>
        </div>
        <div className="card px-4 py-3 text-center min-w-[140px]">
          <div className="k">status</div>
          <div className="mt-1 text-xl font-bold text-[var(--accent2)] flex items-center justify-center gap-2">
            <span className="live-dot" /> {data?.status || "…"}
          </div>
          <div className="mono text-[10px] text-[var(--muted)] mt-1">{data?.cluster}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="k">sources</div>
          <div className="mt-2 text-sm">Jupiter · Bluesky-style · Mastodon · Reddit · Google heat</div>
        </div>
        <div className="card p-4">
          <div className="k">mode</div>
          <div className="mt-2 text-sm text-[var(--accent)]">{data?.mode || "hybrid"} · auto-launch optional</div>
        </div>
        <div className="card p-4 flex items-end justify-between">
          <div>
            <div className="k">controls</div>
            <div className="mt-2 text-sm">manual scan</div>
          </div>
          <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={load}>
            scan now
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3 flex justify-between items-center">
          <span className="k">radar feed</span>
          <span className="mono text-[10px] text-[var(--muted)]">
            updated {data?.updated ? new Date(data.updated).toLocaleTimeString() : "—"}
          </span>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {trends.map((t, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
              <span className="mono text-xs w-6 text-[var(--accent)]">{t.source}</span>
              <span className="flex-1 font-medium">{t.title}</span>
              <span className="mono text-sm text-[var(--warn)] w-10 text-right">{t.heat}</span>
              <Link href={`/launch?trend=${encodeURIComponent(t.title)}`} className="btn text-xs py-1 px-3">
                forge →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
