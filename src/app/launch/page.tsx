"use client";

import { useEffect, useState } from "react";
import { DAY1_FAMILIES } from "@/lib/cluster";

type Quote = {
  launchFeeSol: number;
  devBuySol: number;
  networkRentSol: number;
  totalSol: number;
  cluster: string;
};

export default function LaunchPage() {
  const [family, setFamily] = useState("claude");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fund, setFund] = useState("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/launch")
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => {});
  }, []);

  async function create() {
    setBusy(true);
    setResult("");
    try {
      const r = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", family }),
      });
      const j = await r.json();
      setFund(j.fund_address || "");
      setResult(JSON.stringify(j, null, 2));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!fund) return;
    setBusy(true);
    try {
      const r = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", fund_address: fund, family }),
      });
      const j = await r.json();
      setResult(JSON.stringify(j, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">launch</p>
        <h2 className="text-xl font-bold">Launch a model token_</h2>
        <p className="mt-2 text-sm text-claw-muted max-w-2xl">
          One token per model family. We create a dev wallet, you fund it, we launch on pump.fun and claim creator
          rewards for your stakers. Devnet/testnet first — same fee math as mainnet.
        </p>
      </div>

      <section className="panel p-4">
        <p className="kicker">01 pick a model family</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DAY1_FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFamily(f.id)}
              className={`text-left border p-3 ${
                family === f.id ? "border-claw-cyan text-claw-cyan" : "border-claw-border text-claw-muted"
              }`}
            >
              <div className="font-bold">{f.name}</div>
              <div className="text-xs">
                {f.models} models · {f.priceRange}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <p className="kicker">02 fee box</p>
        {quote && (
          <ul className="mt-3 space-y-1 text-sm">
            <li className="flex justify-between">
              <span>launch fee</span>
              <span>{quote.launchFeeSol} SOL</span>
            </li>
            <li className="flex justify-between">
              <span>dev buy</span>
              <span>{quote.devBuySol} SOL</span>
            </li>
            <li className="flex justify-between">
              <span>network + rent</span>
              <span>{quote.networkRentSol} SOL</span>
            </li>
            <li className="flex justify-between border-t border-claw-border pt-2 font-bold text-claw-gold">
              <span>total</span>
              <span>{quote.totalSol.toFixed(3)} SOL</span>
            </li>
          </ul>
        )}
        <p className="mt-2 text-xs text-claw-muted">cluster: {quote?.cluster || "…"} · dev buy tokens are yours to claim</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-hot" disabled={busy} onClick={create}>
            create dev wallet
          </button>
          <button type="button" className="btn" disabled={busy || !fund} onClick={confirm}>
            confirm launch (mock pump)
          </button>
        </div>
        {fund && (
          <p className="mt-3 text-xs break-all">
            fund_address: <span className="text-claw-cyan">{fund}</span>
          </p>
        )}
      </section>

      {result && (
        <pre className="panel p-4 text-xs overflow-x-auto text-claw-muted whitespace-pre-wrap">{result}</pre>
      )}
    </div>
  );
}
