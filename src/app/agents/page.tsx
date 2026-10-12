"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  status: string;
  mode: string;
  solBalance: number;
  usdcBalance: number;
  pnlSol: number;
  lastQuote?: { outAmount: string };
  trades: { side: string; inAmount: string; outAmount: string; note: string }[];
};

export default function AgentsPage() {
  const { publicKey } = useWallet();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const j = await fetch("/api/agents").then((r) => r.json());
    setAgents(j.agents || []);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function create() {
    setBusy(true);
    try {
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", owner: publicKey?.toBase58() || "anon", sol: 1 }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function tick(id: string) {
    setBusy(true);
    try {
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick", id }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function run(id: string) {
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id, status: "running" }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="k">{"// engine 02"}</p>
          <h1 className="text-3xl font-bold tracking-tight">Trading agents_</h1>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-xl">
            Live Jupiter quotes + paper trades. Tick to pull market and execute paper buy.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
            + deploy
          </button>
          <Link href="/trade" className="btn btn-go">
            dex →
          </Link>
        </div>
      </div>

      {agents.length === 0 && (
        <div className="card p-8 text-center text-[var(--muted)]">
          no agents yet_
          <div className="mt-4">
            <button type="button" className="btn btn-primary" onClick={create}>
              deploy
            </button>
          </div>
        </div>
      )}

      {agents.map((a) => (
        <div key={a.id} className="card p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <div className="font-semibold text-lg">{a.name}</div>
              <div className="mono text-xs text-[var(--muted)]">
                {a.id} · {a.mode} · {a.status}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => run(a.id)}>
                run
              </button>
              <button type="button" className="btn btn-go" disabled={busy} onClick={() => tick(a.id)}>
                tick
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="k">SOL</div>
              <div className="font-bold mono">{a.solBalance.toFixed(4)}</div>
            </div>
            <div>
              <div className="k">USDC</div>
              <div className="font-bold mono text-[var(--accent)]">{a.usdcBalance.toFixed(4)}</div>
            </div>
            <div>
              <div className="k">pnl</div>
              <div className="font-bold mono">{a.pnlSol.toFixed(4)}</div>
            </div>
            <div>
              <div className="k">quote</div>
              <div className="mono text-xs">
                {a.lastQuote ? `${(Number(a.lastQuote.outAmount) / 1e6).toFixed(4)} USDC` : "—"}
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-1 mono text-[11px] text-[var(--muted)]">
            {a.trades.slice(0, 6).map((t, i) => (
              <li key={i}>
                {t.side} {t.inAmount} → {t.outAmount}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
