"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

export default function TradePage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const [amountSol, setAmountSol] = useState("0.01");
  const [quote, setQuote] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(true);

  const push = (s: string) => setLog((L) => [`${new Date().toLocaleTimeString()} ${s}`, ...L].slice(0, 20));

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const lamports = Math.floor(Number(amountSol || 0) * 1e9);
      const r = await fetch(`/api/trade?amount=${lamports}&slippageBps=50`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "quote fail");
      setQuote(j);
    } catch (e) {
      setErr(String(e));
    }
  }, [amountSol]);

  useEffect(() => {
    refresh();
    if (!auto) return;
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh, auto]);

  async function doSwap() {
    if (!publicKey || !signTransaction || !quote?.quote) {
      setErr("connect wallet + wait for quote");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap",
          userPublicKey: publicKey.toBase58(),
          quoteResponse: quote.quote,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "swap build fail");
      const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
      const signed = await signTransaction(tx as any);
      const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      // Jupiter swap is mainnet liquidity — warn user
      const conn = new Connection(rpc.includes("devnet") ? "https://api.mainnet-beta.solana.com" : rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize());
      push(`swap sent ${sig}`);
      setQuote(null);
      await refresh();
    } catch (e) {
      setErr(String(e));
      push(`err ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="k">// dex · jupiter</p>
        <h1 className="text-3xl font-bold tracking-tight">Trade_</h1>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-xl">
          Live Jupiter quotes (SOL → USDC). Auto-refresh every 8s. Swap builds a real tx for your wallet to sign
          (mainnet liquidity).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5 space-y-4">
          <label className="block text-xs text-[var(--muted)]">
            you pay (SOL)
            <input className="mono-input mt-1" value={amountSol} onChange={(e) => setAmountSol(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-go" onClick={refresh} disabled={busy}>
              refresh quote
            </button>
            <button type="button" className={`chip ${auto ? "chip-on" : ""}`} onClick={() => setAuto((v) => !v)}>
              auto {auto ? "on" : "off"}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !connected} onClick={doSwap}>
              buy USDC (sign)
            </button>
          </div>
          {!connected && <p className="text-xs text-[var(--warn)]">connect wallet top-right to swap</p>}
          {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
        </div>

        <div className="card p-5">
          <p className="k">// live quote</p>
          {quote?.ok ? (
            <div className="mt-3 space-y-2 mono text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">in</span>
                <span>{(Number(quote.inAmount) / 1e9).toFixed(6)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">out</span>
                <span className="text-[var(--accent)] text-xl font-bold">{quote.outUi} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--muted)]">impact</span>
                <span>{quote.priceImpactPct ?? "—"}%</span>
              </div>
              <p className="text-[10px] text-[var(--muted)] pt-2">{quote.cluster_note}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">loading quote…</p>
          )}
        </div>
      </div>

      <div className="card p-4">
        <p className="k mb-2">// activity</p>
        <ul className="space-y-1 mono text-xs text-[var(--muted)]">
          {log.length === 0 && <li>no swaps yet</li>}
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
