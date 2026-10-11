"use client";

import { useEffect, useState } from "react";

export default function MarketPage() {
  const [data, setData] = useState<any>(null);
  const [wallet, setWallet] = useState("devnet-test-wallet");
  const [sol, setSol] = useState("0.1");
  const [out, setOut] = useState("");

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
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
    <div className="space-y-4">
      <p className="kicker">credits market</p>
      <h2 className="text-xl font-bold">main pool</h2>
      <p className="text-sm text-claw-muted max-w-xl">
        Earners sell at 60% of retail, builders buy at 60% — every credit backed by real rewards. Selling opens soon.
      </p>
      <div className="panel p-4 space-y-3">
        <label className="block text-xs text-claw-muted">
          wallet
          <input
            className="mt-1 w-full bg-claw-bg border border-claw-border px-2 py-2 text-sm"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </label>
        <label className="block text-xs text-claw-muted">
          you pay (SOL)
          <input
            className="mt-1 w-full bg-claw-bg border border-claw-border px-2 py-2 text-sm"
            value={sol}
            onChange={(e) => setSol(e.target.value)}
          />
        </label>
        <button type="button" className="btn-hot" onClick={buy}>
          buy credits (60%)
        </button>
      </div>
      <div className="panel p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-claw-muted">
            <tr>
              <th className="py-1">model</th>
              <th>retail / 1M</th>
              <th>builder / 1M</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows || []).map((r: any) => (
              <tr key={r.model} className="border-t border-claw-border">
                <td className="py-2">{r.model}</td>
                <td>${r.retail_per_1m}</td>
                <td className="text-claw-gold">${r.builder_per_1m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {out && <pre className="panel p-3 text-xs text-claw-muted whitespace-pre-wrap">{out}</pre>}
    </div>
  );
}
