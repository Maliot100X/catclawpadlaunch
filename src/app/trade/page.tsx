"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DECIMALS: Record<string, number> = { [SOL]: 9, [USDC]: 6 };

type Coin = { id: number; name: string; ticker: string; mint: string | null; status: string };

export default function TradePage() {
  const { connection } = useConnection();
  const { publicKey, connect, connected, signTransaction } = useWallet();

  const [coins, setCoins] = useState<Coin[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mint, setMint] = useState<string>("");
  const [amount, setAmount] = useState("0.1");
  const [slippage, setSlippage] = useState("50");
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [txSig, setTxSig] = useState<string>("");
  const [log, setLog] = useState<string[]>(["dex terminal ready · real jupiter routing · wallet-signed execution"]);

  const push = (s: string) => setLog((L) => [`${new Date().toLocaleTimeString()} · ${s}`, ...L].slice(0, 30));

  useEffect(() => {
    fetch("/api/coins").then((r) => r.json()).then((j) => {
      const live = (j.coins ?? []).filter((c: Coin) => c.mint);
      setCoins(live);
      if (live[0]?.mint) setMint(live[0].mint);
    }).catch(() => {});
  }, []);

  const tokens = useMemo(() => {
    const list: { mint: string; label: string; decimals: number }[] = [
      { mint: SOL, label: "SOL", decimals: 9 },
      { mint: USDC, label: "USDC", decimals: 6 },
    ];
    for (const c of coins) {
      if (c.mint && !list.some((t) => t.mint === c.mint)) {
        list.push({ mint: c.mint, label: `${c.ticker} · ${c.name}`, decimals: 9 });
      }
    }
    return list;
  }, [coins]);

  const selected = tokens.find((t) => t.mint === mint) ?? tokens[0];
  const inMint = side === "buy" ? SOL : mint;
  const outMint = side === "buy" ? mint : SOL;
  const inDecimals = DECIMALS[inMint] ?? selected.decimals;

  const lamports = useMemo(() => {
    const n = Number(amount || "0");
    if (!Number.isFinite(n) || n <= 0) return "0";
    return String(Math.floor(n * Math.pow(10, inDecimals)));
  }, [amount, inDecimals]);

  const fetchQuote = useCallback(async () => {
    if (!mint || lamports === "0") return;
    setBusy(true);
    try {
      const r = await fetch(`/api/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${lamports}&slippageBps=${slippage}`);
      const j = await r.json();
      if (!j.ok) { setQuote(null); push(`quote failed: ${JSON.stringify(j.error).slice(0, 80)}`); return; }
      setQuote(j);
      push(`quote ok · in ${j.inAmount} → out ${j.outAmount} · impact ${(Number(j.priceImpactPct) * 100).toFixed(3)}% · route ${j.routeLabels.join(" + ") || "—"}`);
    } finally { setBusy(false); }
  }, [inMint, outMint, lamports, mint, slippage]);

  useEffect(() => {
    const t = setTimeout(() => { fetchQuote().catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  async function execute() {
    if (!quote) return;
    if (!connected || !publicKey) { await connect().catch(() => {}); return; }
    setBusy(true); setTxSig(""); setStatus("building swap…");
    try {
      const r = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quote.quote, userPublicKey: publicKey.toBase58() }),
      });
      const j = await r.json();
      if (!j.ok) { setStatus(`swap build failed: ${JSON.stringify(j.error).slice(0, 120)}`); push("swap build failed"); return; }
      setStatus("sign in wallet…");
      const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
      const signed = await signTransaction!(tx);
      setStatus("sending…");
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setTxSig(sig);
      setStatus(`sent · confirming…`);
      push(`tx sent ${sig.slice(0, 20)}…`);
      const conf = await connection.confirmTransaction(sig, "confirmed");
      setStatus(conf.value.err ? `failed: ${JSON.stringify(conf.value.err)}` : "confirmed on-chain");
      push(conf.value.err ? "tx failed" : `confirmed ${sig.slice(0, 16)}…`);
    } catch (e: any) {
      setStatus(`error: ${String(e?.message ?? e).slice(0, 140)}`);
      push(`error ${String(e?.message ?? e).slice(0, 90)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">dex terminal · real routing</p>
        <h2 className="text-2xl font-bold tracking-tight">TRADE_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
          Live Jupiter routing and real swap transactions. Quotes are real market data; the swap is
          built server-side and signed in your wallet — this app never holds your funds or your keys.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap gap-1">
            <button className={`chip ${side === "buy" ? "chip-on" : ""}`} onClick={() => setSide("buy")}>BUY</button>
            <button className={`chip ${side === "sell" ? "chip-on" : ""}`} onClick={() => setSide("sell")}>SELL</button>
          </div>

          <label className="block">
            <span className="kicker">token</span>
            <select value={mint} onChange={(e) => setMint(e.target.value)}
              className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-2 mono text-xs outline-none focus:border-[var(--lime)]">
              {tokens.map((t) => <option key={t.mint} value={t.mint}>{t.label}</option>)}
            </select>
            {coins.length === 0 && <span className="mono text-[10px] text-[var(--muted)]">no launched mints yet — forge + launch one, it appears here</span>}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="kicker">{side === "buy" ? "you pay (SOL)" : "you sell"}</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01"
                className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
            </label>
            <label className="block">
              <span className="kicker">slippage (bps)</span>
              <input value={slippage} onChange={(e) => setSlippage(e.target.value)} type="number"
                className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
            </label>
          </div>

          <div className="border border-[var(--line)] p-3 mono text-[11px] space-y-1">
            <div className="flex justify-between"><span className="text-[var(--muted)]">route</span><span>{quote?.routeLabels?.join(" + ") || "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">in</span><span>{quote?.inAmount ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">out</span><span className="text-[var(--lime)]">{quote?.outAmount ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">price impact</span><span>{quote ? (Number(quote.priceImpactPct) * 100).toFixed(3) + "%" : "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">api host</span><span>{quote?.host ?? "—"}</span></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={fetchQuote}>{busy ? "working…" : "refresh quote"}</button>
            <button className="btn btn-forge" disabled={busy || !quote} onClick={execute}>
              {!connected ? "connect wallet to trade" : side === "buy" ? "BUY — sign in wallet" : "SELL — sign in wallet"}
            </button>
          </div>

          {status && <p className="mono text-[11px] text-[var(--cyan)]">{status}</p>}
          {txSig && (
            <p className="mono text-[11px]">
              tx: <a className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer"
                href={`https://solscan.io/tx/${txSig}`}>{txSig.slice(0, 32)}…</a>
            </p>
          )}
        </div>

        <div className="panel p-4">
          <p className="kicker">terminal log</p>
          <div className="mt-3 mono text-[11px] space-y-1 max-h-80 overflow-y-auto">
            {log.map((l, i) => <div key={i} className={i === 0 ? "text-[var(--lime)]" : "text-[var(--muted)]"}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
