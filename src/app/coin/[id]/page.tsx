"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

const SOL = "So11111111111111111111111111111111111111112";

type Detail = {
  ok: boolean; mint: string; isOurs: boolean;
  our: { id: number; name: string; ticker: string; description: string; status: string; when: string; logoUrl: string | null; modelUrl?: string | null } | null;
  onchain: { cluster: string; decimals: number; supply: number | null; mintAuthority: string | null; freezeAuthority: string | null } | null;
  market: any | null;
  links: Record<string, string>;
};
type Ev = { kind: string; txType?: string; solAmount?: number; marketCapSol?: number; trader?: string; name?: string; symbol?: string; mint?: string };
type DexTrade = { side: string; user: string; sol: number; tokens: number; price: number; signature: string; at: string };
type DexState = {
  ok: boolean; priceSolPerToken: number; marketCapSol: number; curveProgressPct: number;
  solCollected: number; graduationSol: number; supplyTokens: number; buys: number; sells: number;
  trades: DexTrade[]; series: { p: number; side: string }[];
};

function usd(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
const sci = (n?: number | null) => (n == null || !Number.isFinite(n) ? "—" : n < 0.001 ? n.toExponential(3) : n.toFixed(6));

function Spark({ series }: { series: { p: number }[] }) {
  if (!series || series.length < 2) return <div className="mono text-[10px] text-[var(--muted)]">no trades yet — the first real fill draws this line</div>;
  const ps = series.map((s) => s.p);
  const min = Math.min(...ps), max = Math.max(...ps);
  const span = max - min || 1;
  const w = 100, h = 32;
  const d = ps.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (ps.length - 1)) * w},${h - ((p - min) / span) * h}`).join(" ");
  const up = ps[ps.length - 1] >= ps[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-10">
      <path d={d} fill="none" stroke={up ? "var(--lime)" : "#ff6b9d"} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function CoinPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet();

  const [d, setD] = useState<Detail | null>(null);
  const [dex, setDex] = useState<DexState | null>(null);
  const [wsTrades, setWsTrades] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.05");
  const [sellPct, setSellPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sigLink, setSigLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState<any>(null);
  const [emptyAccts, setEmptyAccts] = useState<number | null>(null);
  const [risk, setRisk] = useState<any>(null);
  const [holders, setHolders] = useState<any>(null);

  // real risk + distribution intelligence (three.ws, keyless)
  useEffect(() => {
    if (d?.isOurs) return;
    let alive = true;
    Promise.all([
      fetch(`/api/three?kind=security&address=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/three?kind=holders&address=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([s, h]) => {
      if (!alive) return;
      if (s?.ok) setRisk(s.data);
      if (h?.ok) setHolders(h.data);
    });
    return () => { alive = false; };
  }, [d?.isOurs, id]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/token/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/dex?mint=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    if (a) setD(a);
    if (b?.ok) setDex(b);
    setLoading(false);
  }, [id]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { const t = setInterval(() => load().catch(() => {}), 20000); return () => clearInterval(t); }, [load]);

  // pump.fun websocket trades for real market tokens
  useEffect(() => {
    if (!d || d.isOurs) return;
    let alive = true;
    const tick = async () => {
      try {
        const j = await fetch(`/api/pumpdev?topic=trades&mint=${id}`, { cache: "no-store" }).then((r) => r.json());
        if (alive && j?.events?.length) setWsTrades((p) => [...j.events.filter((e: Ev) => e.kind === "trade"), ...p].slice(0, 30));
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 9000);
    return () => { alive = false; clearInterval(t); };
  }, [id, d]);

  const decimals = d?.onchain?.decimals ?? 9;
  const held = dex ? 0 : 0;

  // ---------- devnet market (our tokens): quote + real on-chain trades ----------
  const quoteDevnet = useCallback(() => {
    if (!dex) return;
    const p = dex.priceSolPerToken;
    if (tab === "buy") {
      const sol = Number(amount || 0);
      setQ({ kind: "devnet", solIn: sol, tokensOut: p > 0 ? sol / p : 0, price: p });
    } else {
      setQ({ kind: "devnet", tokensIn: 0, price: p });
    }
  }, [amount, dex, tab]);
  useEffect(() => { quoteDevnet(); }, [quoteDevnet]);

  // ---------- real market (pump/dex tokens): jupiter quote ----------
  const quoteJup = useCallback(async () => {
    if (!d || d.isOurs) return;
    const inMint = tab === "buy" ? SOL : id;
    const outMint = tab === "buy" ? id : SOL;
    const dec = inMint === SOL ? 9 : decimals;
    const lamports = String(Math.floor(Number(amount || "0") * Math.pow(10, dec)));
    if (!lamports || lamports === "0") return;
    try {
      const j = await fetch(`/api/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${lamports}&slippageBps=100`, { cache: "no-store" }).then((r) => r.json());
      setQ(j.ok ? { kind: "jupiter", ...j } : null);
    } catch { setQ(null); }
  }, [amount, d, decimals, id, tab]);
  useEffect(() => { quoteJup().catch(() => {}); }, [quoteJup]);

  // ---------- execute ----------
  async function buyDevnet() {
    if (!publicKey) return;
    const r = await fetch("/api/dex/buy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: id, solAmount: Number(amount), userPublicKey: publicKey.toBase58() }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    setStatus(`sign in wallet — ${j.expected.tokensOut.toLocaleString()} tokens`);
    const tx = Transaction.from(Buffer.from(j.transaction, "base64"));
    const signed = await signTransaction!(tx as any);
    setStatus("sending…");
    const sig = await connection.sendRawTransaction((signed as any).serialize(), { maxRetries: 3 });
    setStatus("confirming…");
    await connection.confirmTransaction(sig, "confirmed");
    await fetch("/api/dex/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: id, side: "buy", userWallet: publicKey.toBase58(), solAmount: Number(amount), signature: sig }),
    });
    setStatus("bought — real devnet fill");
    setSigLink(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    await load();
  }

  async function sellDevnet() {
    if (!publicKey) return;
    // read the wallet's real token balance, then sell the chosen share of it
    const ata = await fetch(`/api/dex/balance?mint=${id}&owner=${publicKey.toBase58()}`, { cache: "no-store" })
      .then((r) => r.json()).catch(() => null);
    const total = Number(ata?.uiAmount ?? 0);
    if (!total) { setStatus("no tokens in this wallet — buy first"); return; }
    const amountTokens = (total * sellPct) / 100;
    const r = await fetch("/api/dex/sell", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: id, tokenAmount: amountTokens, userPublicKey: publicKey.toBase58() }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    setStatus(`sign in wallet — ${j.expected.solOut} SOL back`);
    const tx = Transaction.from(Buffer.from(j.transaction, "base64"));
    const signed = await signTransaction!(tx as any);
    setStatus("sending…");
    const sig = await connection.sendRawTransaction((signed as any).serialize(), { maxRetries: 3 });
    setStatus("confirming…");
    await connection.confirmTransaction(sig, "confirmed");
    await fetch("/api/dex/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: id, side: "sell", userWallet: publicKey.toBase58(), tokenAmount: amountTokens, signature: sig }),
    });
    setStatus("sold — real devnet fill");
    setSigLink(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    await load();
  }

  async function swapJupiter() {
    if (!publicKey || !q?.quote) return;
    const r = await fetch("/api/swap", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote: q.quote, userPublicKey: publicKey.toBase58() }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(JSON.stringify(j.error));
    setStatus("sign in wallet…");
    const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
    const signed = await signTransaction!(tx);
    setStatus("sending…");
    const sig = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
    setStatus("confirming…");
    await connection.confirmTransaction(sig, "confirmed");
    setStatus("swap confirmed");
    setSigLink(`https://solscan.io/tx/${sig}`);
    await load();
  }

  async function execute() {
    setBusy(true); setStatus(""); setSigLink("");
    try {
      if (!connected) { setStatus("connect a wallet first"); return; }
      if (d?.isOurs) { tab === "buy" ? await buyDevnet() : await sellDevnet(); }
      else await swapJupiter();
      void signAllTransactions;
    } catch (e: any) {
      setStatus(`error: ${String(e?.message ?? e).slice(0, 160)}`);
    } finally { setBusy(false); }
  }

  // one-click devnet setup: close empty token accounts and get the rent back
  async function cleanup() {
    if (!publicKey) { setStatus("connect a wallet first"); return; }
    setBusy(true); setStatus("scanning wallet for reclaimable accounts…");
    try {
      const j = await fetch(`/api/reclaim?wallet=${publicKey.toBase58()}`, { cache: "no-store" }).then((r) => r.json());
      if (!j?.ok) { setStatus(String(j?.error ?? "reclaim unavailable")); return; }
      setEmptyAccts(j.emptyCount ?? 0);
      if (!j.emptyCount) { setStatus("nothing to reclaim — wallet is clean"); return; }
      setStatus(`sign to close ${j.emptyCount} account(s) and take ~${j.recoveredSol} SOL`);
      const tx = Transaction.from(Buffer.from(j.transaction, "base64"));
      const signed = await signTransaction!(tx as any);
      const sig = await connection.sendRawTransaction((signed as any).serialize(), { maxRetries: 3 });
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`reclaimed ~${j.recoveredSol} SOL from ${j.emptyCount} account(s)`);
      setSigLink(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    } catch (e: any) { setStatus(String(e?.message ?? e).slice(0, 140)); }
    finally { setBusy(false); }
  }

  const name = d?.our?.name ?? d?.market?.name ?? "unknown token";
  const ticker = d?.our?.ticker ?? (d?.market?.symbol ? `$${d.market.symbol}` : "");
  const desc = d?.our?.description ?? d?.market?.description ?? "";
  const img = d?.our?.logoUrl ?? d?.market?.image ?? null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : `https://catclawpad.vercel.app/coin/${id}`;
  const ogUrl = `/api/og/${id}`;
  const trades = useMemo(() => dex?.trades ?? [], [dex]);

  function copy() { navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }

  if (loading) return <div className="panel p-6 mono text-sm text-[var(--muted)]">loading {id.slice(0, 10)}…</div>;
  if (!d?.ok) return (
    <div className="panel p-6 mono text-sm text-[var(--muted)]">
      token not found · {id.slice(0, 12)}… — <Link className="text-[var(--cyan)] underline" href="/coins">browse markets</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ---------- header ---------- */}
      <section className="panel p-4 md:p-6 grid gap-6 md:grid-cols-[140px_1fr] items-start">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={`${name} logo`} className="border border-[var(--line)] aspect-square w-full object-cover" />
        ) : (
          <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-xs text-[var(--muted)]">no logo</div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            {ticker && <span className="mono text-[var(--lime)] text-lg">{ticker}</span>}
            <span className={`chip ${d.isOurs ? "" : "chip-on"}`}>{d.isOurs ? "OUR DEVNET MARKET" : "LIVE MARKET"}</span>
            {(d.market?.complete || (dex?.curveProgressPct ?? 0) >= 100) && <span className="chip chip-on">GRADUATED</span>}
          </div>
          {desc && <p className="text-sm text-[var(--muted)] max-w-2xl">{desc}</p>}

          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            <div className="stat"><div className="k">price</div><div className="v">{d.isOurs ? `${sci(dex?.priceSolPerToken)}` : d.market?.dex?.priceUsd ? `$${d.market.dex.priceUsd}` : "—"}</div><div className="k">{d.isOurs ? "SOL" : "USD"}</div></div>
            <div className="stat"><div className="k">market cap</div><div className="v">{d.isOurs ? `${(dex?.marketCapSol ?? 0).toFixed(1)}` : usd(d.market?.marketCapUsd)}</div><div className="k">{d.isOurs ? "SOL" : ""}</div></div>
            <div className="stat"><div className="k">curve</div><div className="v grad-lime">{d.isOurs ? `${dex?.curveProgressPct ?? 0}%` : d.market?.bondingProgressPct != null ? `${d.market.bondingProgressPct}%` : "—"}</div><div className="k">to graduation</div></div>
            <div className="stat"><div className="k">trades</div><div className="v">{d.isOurs ? `${(dex?.buys ?? 0) + (dex?.sells ?? 0)}` : wsTrades.length ? `${wsTrades.length}+` : "—"}</div><div className="k">{d.isOurs ? `${dex?.buys ?? 0} buy / ${dex?.sells ?? 0} sell` : "live feed"}</div></div>
          </div>
          <div className="grid gap-1 grid-cols-2 sm:grid-cols-4 mono text-[11px]">
            {d.onchain?.supply != null && <div><span className="text-[var(--muted)]">supply </span>{d.onchain.supply.toLocaleString()}</div>}
            <div><span className="text-[var(--muted)]">cluster </span>{d.onchain?.cluster ?? "—"}</div>
            <div><span className="text-[var(--muted)]">mint auth </span>{d.onchain?.mintAuthority ? "active" : "revoked"}</div>
            <div><span className="text-[var(--muted)]">decimals </span>{d.onchain?.decimals ?? "—"}</div>
          </div>

          <div className="flex flex-wrap gap-1">
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.explorerDevnet}>explorer ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.metadata}>metadata ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.pump}>pump.fun ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.dexscreener}>dexscreener ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={d.links.solscan}>solscan ↗</a>
            <button className="chip" onClick={copy}>{copied ? "link copied ✓" : "copy link"}</button>
            <a className="chip chip-on" target="_blank" rel="noreferrer"
               href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                 d.isOurs
                   ? `${name} ${ticker} — live on our devnet market · curve ${dex?.curveProgressPct ?? 0}% · ${(dex?.buys ?? 0) + (dex?.sells ?? 0)} real trades`
                   : `${name} ${ticker} — live ${d.market?.bondingProgressPct ?? ""}% on the curve`
               )}&url=${encodeURIComponent(shareUrl)}`}>
              share on X ↗
            </a>
          </div>
          <p className="mono text-[10px] text-[var(--muted)]">
            real share card: <a className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer" href={ogUrl}>{ogUrl} ↗</a> · live stats + logo, served from our site
          </p>
        </div>
      </section>

      {/* ---------- trade + activity ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="panel p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="kicker m-0">{d.isOurs ? "trade · our devnet market · on-chain settled" : "trade · real jupiter routing"}</p>
            <div className="ml-auto flex gap-1">
              <button className={`chip ${tab === "buy" ? "chip-on" : ""}`} onClick={() => setTab("buy")}>BUY</button>
              <button className={`chip ${tab === "sell" ? "chip-on" : ""}`} onClick={() => setTab("sell")}>SELL</button>
            </div>
          </div>

          {d.isOurs && (
            <div>
              <div className="flex justify-between mono text-[10px] text-[var(--muted)]">
                <span>bonding curve · {dex?.solCollected?.toFixed(3) ?? 0} / {dex?.graduationSol ?? 85} SOL raised</span>
                <span className="text-[var(--lime)]">{dex?.curveProgressPct ?? 0}%</span>
              </div>
              <div className="mt-1 meter"><i style={{ width: `${Math.min(100, dex?.curveProgressPct ?? 0)}%` }} /></div>
              <div className="mt-2 border border-[var(--line)] p-2 bg-[#04050c]">
                <Spark series={dex?.series ?? []} />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <div>
              {tab === "sell" && d.isOurs ? (
                <>
                  <span className="kicker">sell {sellPct}% of your tokens</span>
                  <input type="range" min={5} max={100} step={5} value={sellPct}
                         onChange={(e) => setSellPct(Number(e.target.value))} className="w-full mt-3" />
                </>
              ) : (
                <label className="block">
                  <span className="kicker">{tab === "buy" ? (d.isOurs ? "you pay (SOL)" : "you pay (SOL)") : "you sell (tokens)"}</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01"
                         className="mt-1 w-full bg-[#04050c] border border-[var(--line)] p-3 mono text-sm outline-none focus:border-[var(--lime)]" />
                </label>
              )}
              {!d.isOurs && <p className="mono text-[10px] text-[var(--muted)] mt-1">routes through Jupiter · you sign, we never hold your keys</p>}
            </div>
            <div className="border border-[var(--line)] p-3 mono text-[11px] space-y-1">
              {d.isOurs ? (
                <>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">est. out</span><span className="text-[var(--lime)]">{tab === "buy" ? (q?.tokensOut ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">price</span><span>{sci(dex?.priceSolPerToken)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">fee</span><span>1% → treasury</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">out</span><span className="text-[var(--lime)]">{q?.outAmount ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">route</span><span>{q?.routeLabels?.join("+") || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">impact</span><span>{q ? (Number(q.priceImpactPct) * 100).toFixed(3) + "%" : "—"}</span></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-forge" disabled={busy} onClick={execute}>
              {!connected ? "connect wallet" : tab === "buy" ? "BUY — sign in wallet" : "SELL — sign in wallet"}
            </button>
            {d.isOurs && <button className="btn" disabled={busy} onClick={cleanup}>reclaim empty accounts {emptyAccts != null ? `(${emptyAccts})` : ""}</button>}
            {!d.isOurs && <button className="btn" onClick={() => quoteJup()}>refresh quote</button>}
          </div>

          {status && <p className="mono text-[11px] text-[var(--cyan)]">{status}</p>}
          {sigLink && <a className="mono text-[11px] text-[var(--cyan)] underline" target="_blank" rel="noreferrer" href={sigLink}>view transaction ↗</a>}
          {!connected && <p className="mono text-[10px] text-[var(--muted)]">wallet: use the CONNECT WALLET button in the header (Phantom / Solflare, devnet).</p>}
        </section>

        <section className="panel p-4">
          <p className="kicker">{d.isOurs ? "real fills · our devnet market" : "live trades · pumpdev feed"}</p>
          <div className="mt-3 space-y-1 max-h-80 overflow-y-auto mono text-[11px]">
            {d.isOurs && trades.length === 0 && <div className="text-[var(--muted)]">no fills yet — be the first real buyer</div>}
            {d.isOurs && trades.map((t) => (
              <a key={t.signature} href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`} target="_blank" rel="noreferrer"
                 className="flex items-center gap-2 hover:opacity-80">
                <span className={t.side === "sell" ? "text-[#ff6b9d]" : "text-[var(--lime)]"}>{t.side.toUpperCase()}</span>
                <span className="text-[var(--muted)]">{t.sol.toFixed(4)} SOL</span>
                <span className="text-[var(--cyan)]">{Math.round(t.tokens).toLocaleString()} tok</span>
                <span className="text-[var(--muted)] truncate">{String(t.user).slice(0, 4)}…</span>
              </a>
            ))}
            {!d.isOurs && wsTrades.length === 0 && <div className="text-[var(--muted)]">waiting for trades on this mint…</div>}
            {!d.isOurs && wsTrades.map((t, i) => (
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
      {/* real 3D asset for this coin (three.ws 3D Forge) */}
      {d.our?.modelUrl && (
        <section className="panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="kicker m-0">3d asset · real glb</p>
            <a className="chip" href={d.our.modelUrl} target="_blank" rel="noreferrer">download GLB ↗</a>
            <Link className="chip" href="/3d">make another →</Link>
          </div>
          {/* @ts-expect-error custom element injected by the 3D Forge page script */}
          <model-viewer src={d.our.modelUrl} alt={`${name} 3D model`} camera-controls auto-rotate
                        style={{ width: "100%", height: 360, background: "#04050c", border: "1px solid var(--line)", marginTop: 12 }} />
          <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js" async />
        </section>
      )}

      {/* real risk + holder distribution (three.ws) */}
      {!d.isOurs && (risk || holders) && (
        <section className="panel p-4">
          <p className="kicker m-0">on-chain intelligence · three.ws · live</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {risk && (
              <div className="mono text-[11px] space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">risk</span>
                  <span className={String(risk.riskLevel) === "low" ? "text-[var(--lime)]" : String(risk.riskLevel) === "high" ? "text-[#ff6b9d]" : "text-[var(--cyan)]"}>
                    {String(risk.riskLevel ?? "—").toUpperCase()}
                  </span>
                </div>
                {risk.checks && (
                  <div className="text-[var(--muted)] space-y-0.5">
                    <div>mint authority revoked: <span className="text-[var(--fg)]">{String(risk.checks.mintAuthorityRevoked)}</span></div>
                    <div>freeze authority revoked: <span className="text-[var(--fg)]">{String(risk.checks.freezeAuthorityRevoked)}</span></div>
                    <div>LP burned/locked: <span className="text-[var(--fg)]">{String(risk.checks.lpBurnedOrLocked)}</span></div>
                    <div>top-holder flag: <span className="text-[var(--fg)]">{String(risk.checks.topHolderPctFlag ?? "—")}</span></div>
                  </div>
                )}
                {Array.isArray(risk.reasons) && risk.reasons.length > 0 && (
                  <div className="text-[var(--muted)]">reasons: {risk.reasons.join(" · ")}</div>
                )}
              </div>
            )}
            {holders && (
              <div className="mono text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-[var(--muted)]">holders</span><span>{Number(holders.holderCount ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">top-10 concentration</span><span>{String(holders.top10Pct ?? "—")}% · {String(holders.concentration ?? "")}</span></div>
                {(holders.top ?? []).slice(0, 5).map((h: any, i: number) => (
                  <div key={i} className="flex justify-between text-[var(--muted)]">
                    <span>{String(h.owner).slice(0, 8)}…</span><span>{String(h.pct)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
