"use client";

import { useEffect, useState } from "react";
import { DAY1_FAMILIES } from "@/lib/cluster";
import { useWallet } from "@solana/wallet-adapter-react";

type Quote = {
  launchFeeSol: number;
  devBuySol: number;
  networkRentSol: number;
  totalSol: number;
  cluster: string;
  authority?: string;
  authority_sol?: number;
};

export default function LaunchPage() {
  const { publicKey } = useWallet();
  const [family, setFamily] = useState("claude");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fund, setFund] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function push(s: string) {
    setLog((L) => [s, ...L].slice(0, 12));
  }

  async function refreshQuote() {
    const q = await fetch("/api/launch").then((r) => r.json());
    setQuote(q);
  }

  useEffect(() => {
    refreshQuote().catch(() => {});
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
      push(`created ${j.fund_address?.slice(0, 8)}…`);
    } finally {
      setBusy(false);
    }
  }

  async function fundFromAuthority() {
    if (!fund) return;
    setBusy(true);
    try {
      const r = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fund_from_authority", fund_address: fund }),
      });
      const j = await r.json();
      setResult(JSON.stringify(j, null, 2));
      push(j.ok ? `funded ${String(j.signature).slice(0, 16)}…` : `err ${j.error}`);
      await refreshQuote();
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
      push(j.ok ? `launched ${j.mint}` : `err ${j.error}`);
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
          One token per family. Dev wallet → fund {quote?.totalSol?.toFixed(3) ?? "0.580"} SOL → pump. Connected:{" "}
          {publicKey ? publicKey.toBase58().slice(0, 8) + "…" : "none — use Connect top-right"}.
        </p>
      </div>

      {quote?.authority && (
        <div className="panel p-3 text-xs flex flex-wrap gap-4">
          <span>
            authority <span className="text-claw-cyan">{quote.authority.slice(0, 6)}…{quote.authority.slice(-4)}</span>
          </span>
          <span>
            bal <span className="text-claw-ok">{quote.authority_sol?.toFixed(4)} SOL</span>
          </span>
          <span className="text-claw-muted">cluster {quote.cluster}</span>
        </div>
      )}

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
              <span>{Number(quote.totalSol).toFixed(3)} SOL</span>
            </li>
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-hot" disabled={busy} onClick={create}>
            1 · create dev wallet
          </button>
          <button type="button" className="btn" disabled={busy || !fund} onClick={fundFromAuthority}>
            2 · fund from authority (real devnet tx)
          </button>
          <button type="button" className="btn" disabled={busy || !fund} onClick={confirm}>
            3 · confirm launch
          </button>
        </div>
        {fund && (
          <p className="mt-3 text-xs break-all">
            fund_address: <span className="text-claw-cyan">{fund}</span>
          </p>
        )}
      </section>

      {log.length > 0 && (
        <ul className="text-xs text-claw-muted space-y-1">
          {log.map((l, i) => (
            <li key={i}>// {l}</li>
          ))}
        </ul>
      )}
      {result && <pre className="panel p-4 text-xs overflow-x-auto text-claw-muted whitespace-pre-wrap">{result}</pre>}
    </div>
  );
}
