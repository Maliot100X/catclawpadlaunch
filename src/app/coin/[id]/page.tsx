"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

const SOL = "So11111111111111111111111111111111111111112";

type Detail = {
  ok: boolean;
  mint: string;
  isOurs: boolean;
  our: { id: number; name: string; ticker: string; description: string; status: string; when: string; logoUrl: string | null } | null;
  onchain: { cluster: string; decimals: number; supply: number | null; mintAuthority: string | null; freezeAuthority: string | null; isInitialized: boolean } | null;
  market: any | null;
  links: Record<string, string>;
};

type Ev = { kind: string; mint?: string; txType?: string; solAmount?: number; tokenAmount?: number; marketCapSol?: number; trader?: string; at?: number };

function usd(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function CoinPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { connection } = useConnection();
  const { publicKey, connected, connect, signTransaction } = useWallet();

  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<Ev[]>([]);
  const [q, setQ] = useState<any>(null);
  const [amount, setAmount] = useState("0.05");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sigLink, setSigLink] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/token/${id}`, { cache: "no-store" });
      const j = await r.json();
      setD(j);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pumpdev?topic=trades&mint=${id}`, { cache: "no-store" });
        const j = await r.json();
        if (alive && j?.events?.length) {
          setTrades((prev) => [...j.events.filter((e: Ev) => e.kind === "trade"), ...prev].slice(0, 30));
        }
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 9000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  const fetchQuote = useCallback(async () => {
    const inMint = side === "buy" ? SOL : id;
    const outMint = side === "buy" ? id : SOL;
    const decimals = inMint === SOL ? 9 : 6;
    const lamports = String(Math.floor(Number(amount || "0") * Math.pow(10, decimals)));
    if (!lamports || lamports === "0") return;
    try {
      const r = await fetch(`/api/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${lamports}&slippageBps=100`, { cache: "no-store" });
      const j = await r.json();
      setQ(j.ok ? j : null);
    } catch { setQ(null); }
  }, [amount, id, side]);

  useEffect(() => { fetchQuote().catch(() => {}); }, [fetchQuote]);

  async function execute() {
    if (!q) return;
    if (!connected || !publicKey) { await connect().catch(() => {}); return; }
    setBusy(true); setStatus("building swap…"); setSigLink("");
    try {
      const r = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: q.quote, userPublicKey: publicKey.toBase58() }),
      });
      const j = await r.json();
      if (!j.ok) { setStatus(`swap build failed: ${JSON.stringify(j.error).slice(0, 100)}`); return; }
      setStatus("sign in wallet…");
      const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
      const signed = await signTransaction!(tx);
      setStatus("sending…");
      const sig = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
      setStatus("confirming…");
      const conf = await connection.confirmTransaction(sig, "confirmed");
      if (conf.value.err) { setStatus(`failed: ${JSON.stringify(conf.value.err)}`); return; }
      setStatus(`${side === "buy" ? "bought" : "sold"} · confirmed`);
      setSigLink(`https://solscan.io/tx/${sig}`);
      load().catch(() => {});
    } catch (e: any) {
      setStatus(`error: ${String(e?.message ?? e).slice(0, 120)}`);
    } finally { setBusy(false); }
  }

  const name = d?.our?.name ?? d?.market?.name ?? "unknown token";
  const ticker = d?.our?.ticker ?? (d?.market?.symbol ? `$${d.market.symbol}` : "");
  const desc = d?.our?.description ?? d?.market?.description ?? "";
  const img = d?.our?.logoUrl ?? d?.market?.image ?? null;
  const mcap = d?.market?.marketCapUsd ?? d?.market?.dex?.marketCap ?? 0;
  const curve = d?.market?.bondingProgressPct ?? null;
  const isDevnetOnly = Boolean(d?.our && !d?.market?.dex);
  const shareUrl = typeof window !== "undefined" ? window.location.href : `https://catclawpad.vercel.app/coin/${id}`;

  function copy() {
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  if (loading) return <div className="panel p-6 mono text-sm text-[var(--muted)]">loading {id.slice(0, 10)}…</div>;
  if (!d?.ok) return (
    <div className="panel p-6 mono text-sm text-[var(--muted)]">
      token not found · {id.slice(0, 12)}… — <Link className="text-[var(--cyan)] underline" href="/coins">browse markets</Link>
    </div>
  );

  return (
    <div className="space-y-8">
      <section className="panel p-4 md:p-6 grid gap-6 md:grid-cols-[150px_1fr] items-start">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={`${name} logo`} className="border border-[var(--line)] aspect-square w-full object-cover" />
        ) : (
          <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-xs text-[var(--muted)]">no logo</div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold">{name}</h2>
            {ticker && <span className="mono text-[var(--lime)] text-lg">{ticker}</span>}
            <span className={`chip ${d.isOurs ? "" : "chip-on"}`}>{d.isOurs ? "OUR DEVNET MINT" : "LIVE MARKET"}</span>
            {d.market?.complete && <span className="chip chip-on">GRADUATED</span>}
          </div>

          {desc && <p className="text-sm text-[var(--muted)] max-w-2xl">{desc}</p>}

          {curve != null && (
            <div>
              <div className="flex justify-between mono text-[10px] text-[var(--muted)]">
                <span>bonding curve</span><span className={curve >= 99.9 ? "text-[var(--lime)]" : ""}>{curve}%</span>
              </div>
              <div className="mt-1 h-2 w-full bg-[#04050c] border border-[var(--line)]">
                <div className="h-full" style={{ width: `${Math.min(100, curve)}%`, background: curve >= 99.9 ? "var(--lime)" : "var(--cyan)" }} />
              </div>
            </div>
          )}

          <div className="grid gap-1 sm:grid-cols-4 mono text-[11px]">
            <div><span className="text-[var(--muted)]">mcap </span>{usd(mcap)}</div>
            <div><span className="text-[var(--muted)]">price </span>{d.market?.dex?.priceUsd ? `$${d.market.dex.priceUsd}` : "—"}</div>
            <div><span className="text-[var(--muted)]">liq </span>{usd(d.market?.dex?.liquidityUsd)}</div>
            <div><span className="text-[var(--muted)]">24h </span>{d.market?.dex?.priceChange24h != null ? `${d.market.dex.priceChange24h.toFixed(1)}%` : "—"}</div>
            {d.onchain?.supply != null && <div><span className="text-[var(--muted)]">supply </span>{d.onchain.supply.toLocaleString()}</div>}
            {d.onchain?.decimals != null && <div><span className="text-[var(--muted)]">decimals </span>{d.onchain.decimals}</div>}
            <div><span className="text-[var(--muted)]">cluster </span>{d.onchain?.cluster ?? "—"}</div>
            <div><span className="text-[var(--muted)]">mint auth </span>{d.onchain?.mintAuthority ? "active" : "revoked"}</div>
          </div>

          <div className="flex flex-wrap gap-1">
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.explorerDevnet}>explorer ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.metadata}>metadata ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.pump}>pump.fun ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.dexscreener}>chart ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.solscan}>solscan ↗</a>
            <Link className="chip chip-on" href={d.links.trade}>trade →</Link>
            <button className="chip" onClick={copy}>{copied ? "link copied ✓" : "copy link"}</button>
            <a className="chip" target="_blank" rel="noreferrer"
               href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${name} ${ticker} — live on catclawpad`)}&url=${encodeURIComponent(shareUrl)}`}>
              share on X ↗
            </a>
          </div>
          <p className="mono text-[10px] text-[var(--muted)]">
            share card: <a className="text-[var(--cyan)] underline" href={`/api/og/${id}`} target="_blank" rel="noreferrer">/api/og/{id.slice(0, 8)}…</a> (real live stats)
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="panel p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="kicker m-0">trade · real jupiter routing</p>
            <div className="ml-auto flex gap-1">
              <button className={`chip ${side === "buy" ? "chip-on" : ""}`} onClick={() => setSide("buy")}>BUY</button>
              <button className={`chip ${side === "sell" ? "chip-on" : ""}`} onClick={() => setSide("sell")}>SELL</button>
            </div>
          </div>

          {isDevnetOnly && (
            <p className="mono text-[10px] text-[var(--muted)] border border-[var(--line)] p-2">
              this is our devnet mint — no mainnet liquidity exists, so it cannot be swapped on a real DEX.
              use the faucet for devnet SOL, or open a live market coin to trade for real.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="block">
              <span className="kicker">{side === "buy" ? "you pay (SOL)" : "you sell (tokens)"}</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01"
                className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
            </label>
            <div className="border border-[var(--line)] p-3 mono text-[11px] space-y-1">
              <div className="flex justify-between"><span className="text-[var(--muted)]">out</span><span className="text-[var(--lime)]">{q?.outAmount ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">route</span><span>{q?.routeLabels?.join("+") || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">impact</span><span>{q ? (Number(q.priceImpactPct) * 100).toFixed(3) + "%" : "—"}</span></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={fetchQuote}>refresh quote</button>
            <button className="btn btn-forge" disabled={busy || !q} onClick={execute}>
              {!connected ? "connect wallet" : side === "buy" ? "BUY — sign in wallet" : "SELL — sign in wallet"}
            </button>
          </div>
          {status && <p className="mono text-[11px] text-[var(--cyan)]">{status}</p>}
          {sigLink && <a className="mono text-[11px] text-[var(--cyan)] underline" target="_blank" rel="noreferrer" href={sigLink}>view tx ↗</a>}
        </section>

        <section className="panel p-4">
          <p className="kicker">live trades · pumpdev feed</p>
          <div className="mt-3 space-y-1 max-h-80 overflow-y-auto mono text-[11px]">
            {trades.length === 0 && <div className="text-[var(--muted)]">waiting for trades on this mint…</div>}
            {trades.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={t.txType === "sell" ? "text-[#ff6b9d]" : "text-[var(--lime)]"}>{(t.txType || "?").toUpperCase()}</span>
                <span className="text-[var(--muted)]">{t.solAmount != null ? (Number(t.solAmount) >= 0.001 ? Number(t.solAmount).toFixed(3) : Number(t.solAmount).toFixed(6)) : "—"} SOL</span>
                <span className="text-[var(--cyan)]">{t.marketCapSol ? `mc ${Number(t.marketCapSol).toFixed(1)}` : ""}</span>
                <span className="text-[var(--muted)] truncate">{t.trader ? String(t.trader).slice(0, 4) + "…" : ""}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
