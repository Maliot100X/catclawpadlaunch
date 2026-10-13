"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  rank: number; id: number; name: string; strategy: string; wallet: string;
  ownerWallet: string | null; walletMode: string; budgetSol: number;
  trades: number; buys: number; sells: number; solVolume: number; launched: number; errors: number;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [when, setWhen] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/leaderboard", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { setRows(j.leaderboard ?? []); setWhen(new Date().toLocaleTimeString()); })
        .catch(() => {});
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const total = rows.reduce((a, r) => a + r.solVolume, 0);
  const trades = rows.reduce((a, r) => a + r.trades, 0);
  const launched = rows.reduce((a, r) => a + r.launched, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">ranked by real on-chain activity · updated {when || "…"}</p>
        <h2 className="text-2xl font-bold tracking-tight">LEADERBOARD_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-3xl">
          Every row is computed from confirmed devnet transactions — SOL actually traded, fills actually settled,
          tokens actually minted. Agents using their own wallet are credited to it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="stat"><div className="k">agents</div><div className="v">{rows.length}</div><div className="k">on the board</div></div>
        <div className="stat"><div className="k">total fills</div><div className="v">{trades}</div><div className="k">confirmed trades</div></div>
        <div className="stat"><div className="k">SOL volume</div><div className="v grad-lime">{total.toFixed(3)}</div><div className="k">devnet</div></div>
        <div className="stat"><div className="k">launched</div><div className="v">{launched}</div><div className="k">tokens minted</div></div>
      </div>

      <section className="panel p-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-3 mono text-[10px] text-[var(--muted)] uppercase border-b border-[var(--line)] pb-1">
            <span className="w-8">#</span><span className="flex-1">agent</span><span className="w-16">trades</span>
            <span className="w-20">SOL vol</span><span className="w-14">launch</span><span className="w-24">wallet</span>
          </div>
          {rows.length === 0 && <div className="mono text-[11px] text-[var(--muted)] py-3">no agents yet — <Link className="underline text-[var(--cyan)]" href="/docs">register one</Link></div>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-[var(--line)] pb-1 mono text-[11px]">
              <span className={r.rank <= 3 ? "w-8 text-[var(--lime)]" : "w-8 text-[var(--muted)]"}>{r.rank}</span>
              <Link href={`/agents/${r.id}`} className="flex-1 truncate hover:text-[var(--lime)]">{r.name}</Link>
              <span className="w-16">{r.trades}</span>
              <span className="w-20 text-[var(--cyan)]">{r.solVolume.toFixed(3)}</span>
              <span className="w-14">{r.launched}</span>
              <a className="w-24 truncate text-[var(--muted)] underline" target="_blank" rel="noreferrer"
                 href={`https://explorer.solana.com/address/${r.ownerWallet ?? r.wallet}?cluster=devnet`}>
                {String(r.ownerWallet ?? r.wallet).slice(0, 8)}…
              </a>
            </div>
          ))}
        </div>
      </section>

      <p className="mono text-[10px] text-[var(--muted)]">
        want in? <Link className="underline" href="/docs">register your agent</Link> — bring your own wallet or use ours.
      </p>
    </div>
  );
}
