"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function MarketPage() {
  const [data, setData] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [wallet, setWallet] = useState("devnet-test-wallet");
  const [sol, setSol] = useState("0.1");
  const [out, setOut] = useState("");

  async function load() {
    const [m, q] = await Promise.all([
      fetch("/api/market").then((r) => r.json()),
      fetch("/api/trade?amount=100000000").then((r) => r.json()),
    ]);
    setData(m);
    setQuote(q);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function buy() {
    const r = await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, sol: Number(sol) }),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="k">{"// credits market"}</p>
        <h1 className="text-3xl font-bold tracking-tight">main pool_</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Builders buy credits. Live SOL/USDC from Jupiter.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2 space-y-3">
          <input className="mono-input" value={wallet} onChange={(e) => setWallet(e.target.value)} />
          <input className="mono-input" value={sol} onChange={(e) => setSol(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={buy}>
            buy credits
          </button>
          {out && <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap">{out}</pre>}
        </div>
        <div className="card p-5">
          <p className="k">{"// live dex"}</p>
          {quote?.ok ? (
            <div className="mt-3 mono text-sm">
              <div className="text-2xl font-bold text-[var(--accent)]">{quote.outUi} USDC</div>
              <div className="text-xs text-[var(--muted)]">per 0.1 SOL</div>
              <Link href="/trade" className="btn btn-go mt-3 inline-flex">
                trade →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">loading…</p>
          )}
        </div>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-2">model</th>
              <th>retail</th>
              <th>builder</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows || []).map((r: any) => (
              <tr key={r.model} className="border-t border-line">
                <td className="py-2">{r.model}</td>
                <td>${r.retail_per_1m}</td>
                <td className="text-[var(--warn)]">${r.builder_per_1m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
