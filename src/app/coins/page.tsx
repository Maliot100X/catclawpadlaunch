"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PumpCoin = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  createdAt: number | null;
  marketCapUsd: number;
  complete: boolean;
  bondingProgressPct: number;
  virtualSolReserves: number | null;
  links: { pump: string; dexscreener: string; solscan: string };
  dex?: { dexId?: string; priceUsd?: number; liquidityUsd?: number; volume24h?: number; fdv?: number };
};

type OurCoin = { id: number; name: string; ticker: string; mint: string | null; status: string; when: string; logo_url?: string | null };

const BUCKETS = [
  { id: "new", label: "NEW" },
  { id: "graduate", label: "ABOUT TO GRADUATE" },
  { id: "graduating", label: "GRADUATING" },
] as const;

function fmt(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function CoinsPage() {
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]["id"]>("new");
  const [coins, setCoins] = useState<PumpCoin[]>([]);
  const [ours, setOurs] = useState<OurCoin[]>([]);
  const [meta, setMeta] = useState<{ scannedAt?: string; source?: string; graduationMcapUsd?: number }>({});
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState("");

  const load = useCallback(async (b: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pump?bucket=${b}`);
      const j = await r.json();
      setCoins(j.coins ?? []);
      setMeta({ scannedAt: j.scannedAt, source: j.source, graduationMcapUsd: j.graduationMcapUsd });
      setUpdated(new Date().toLocaleTimeString());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load(bucket).catch(() => {});
    const t = setInterval(() => load(bucket).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, [bucket, load]);

  useEffect(() => {
    fetch("/api/coins").then((r) => r.json()).then((j) => setOurs(j.coins ?? [])).catch(() => {});
  }, []);

  const mine = ours.filter((c) => c.mint);

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">live markets · real data</p>
        <h2 className="text-2xl font-bold tracking-tight">LAUNCHED_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Real pump.fun market data with live bonding-curve progress, plus every coin minted here on devnet.
          Graduation threshold {fmt(meta.graduationMcapUsd ?? 69000)}. Refreshes every 30s.
        </p>
      </div>

      {/* OUR DEVNET LAUNCHES */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="kicker m-0">our devnet launches · minted by the treasury wallet</p>
          <span className="mono text-[10px] text-[var(--muted)]">{mine.length} live mint(s)</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mine.length === 0 && (
            <div className="mono text-[11px] text-[var(--muted)]">
              no mints yet — <Link href="/forge" className="text-[var(--cyan)] underline">forge one</Link>
            </div>
          )}
          {mine.map((c) => (
            <div key={c.id} className="border border-[var(--line)] p-3 bg-[#04050c]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold truncate">{c.name}</span>
                <span className="mono text-[var(--lime)] text-xs">{c.ticker}</span>
              </div>
              <div className="mono text-[10px] text-[var(--muted)] mt-1">
                devnet · {c.status} · {String(c.when).slice(0, 10)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Link href={`/coin/${c.mint}`} className="chip">preview</Link>
                <a className="chip" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/address/${c.mint}?cluster=devnet`}>explorer ↗</a>
                <a className="chip" target="_blank" rel="noreferrer" href={`/api/metadata/${c.mint}`}>metadata ↗</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* REAL MARKET LISTS */}
      <div className="flex flex-wrap items-center gap-2">
        {BUCKETS.map((b) => (
          <button key={b.id} className={`chip ${bucket === b.id ? "chip-on" : ""}`} onClick={() => setBucket(b.id)}>
            {b.label}
          </button>
        ))}
        <span className="mono text-[10px] text-[var(--muted)] ml-auto">
          {loading ? "loading…" : `updated ${updated}`} · {meta.source?.split(" ")[0] ?? "pump.fun"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {coins.map((c) => {
          const grad = c.complete || c.bondingProgressPct >= 99.9;
          return (
            <div key={c.mint} className="panel p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{c.name}</div>
                  <div className="mono text-[11px] text-[var(--lime)]">{c.symbol}</div>
                </div>
                <span className={`chip ${grad ? "chip-on" : ""}`}>{grad ? "GRAD" : "CURVE"}</span>
              </div>

              <div className="mt-3">
                <div className="flex justify-between mono text-[10px] text-[var(--muted)]">
                  <span>bonding curve</span>
                  <span className={grad ? "text-[var(--lime)]" : ""}>{c.bondingProgressPct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full bg-[#04050c] border border-[var(--line)]">
                  <div className="h-full" style={{ width: `${Math.min(100, c.bondingProgressPct)}%`, background: grad ? "var(--lime)" : "var(--cyan)" }} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1 mono text-[10px]">
                <div><span className="text-[var(--muted)]">mcap </span>{fmt(c.marketCapUsd)}</div>
                <div><span className="text-[var(--muted)]">liq </span>{fmt(c.dex?.liquidityUsd)}</div>
                <div><span className="text-[var(--muted)]">24h vol </span>{fmt(c.dex?.volume24h)}</div>
                <div><span className="text-[var(--muted)]">price </span>{c.dex?.priceUsd ? `$${c.dex.priceUsd}` : "—"}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                <a className="chip" target="_blank" rel="noreferrer" href={c.links.pump}>pump.fun ↗</a>
                <a className="chip" target="_blank" rel="noreferrer" href={c.links.dexscreener}>chart ↗</a>
                <a className="chip" target="_blank" rel="noreferrer" href={c.links.solscan}>solscan ↗</a>
                <Link className="chip" href={`/trade?mint=${c.mint}`}>trade →</Link>
              </div>
            </div>
          );
        })}
        {!loading && coins.length === 0 && (
          <div className="panel p-4 mono text-xs text-[var(--muted)]">market feed empty — upstream rate limit, retrying…</div>
        )}
      </div>
    </div>
  );
}
