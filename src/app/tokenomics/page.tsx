"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type T = {
  ok: boolean;
  mint: string;
  sources: string[];
  token?: {
    name?: string; symbol?: string; image?: string | null; description?: string | null;
    creator?: string | null; createdAt?: number | null; twitter?: string | null; website?: string | null;
    marketCapUsd?: number; complete?: boolean; bondingProgressPct?: number;
    virtualSolReserves?: number | null; totalSupply?: number | null;
  };
  fees?: Record<string, any>;
  feeEvents?: { sig: string; sol: number | null; label: string | null }[];
  links?: Record<string, string>;
  launchDate?: string | null;
  agent?: string | null;
};

const usd = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(2)}K` : `$${n.toFixed(2)}`;

export default function TokenomicsPage() {
  const [t, setT] = useState<T | null>(null);
  const [when, setWhen] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/tokenomics", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { setT(j); setWhen(new Date().toLocaleTimeString()); })
        .catch(() => {});
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  const tok = t?.token;
  const fees = t?.fees ?? {};

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker">live token data · {t?.sources?.join(" + ") || "loading…"}</p>
        <h2 className="text-2xl font-bold tracking-tight">TOKENOMICS_</h2>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-3xl">
          Our real token, read straight from pump.fun, clawpump and Solana. Creator fees are earned by the agent
          named on the token and split by its on-chain strategy — nothing on this page is a placeholder.
        </p>
      </div>

      <section className="panel p-4 md:p-6 grid gap-6 md:grid-cols-[130px_1fr] items-start">
        {tok?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tok.image} alt={`${tok?.name} logo`} className="border border-[var(--line)] aspect-square w-full object-cover" />
        ) : (
          <div className="border border-[var(--line)] bg-[#04050c] aspect-square flex items-center justify-center mono text-[10px] text-[var(--muted)]">no logo</div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-bold">{tok?.name ?? "—"}</h3>
            <span className="mono text-[var(--lime)] text-lg">{tok?.symbol ? `$${tok.symbol}` : ""}</span>
            <span className={`chip ${tok?.complete ? "chip-on" : ""}`}>{tok?.complete ? "GRADUATED" : "ON THE CURVE"}</span>
            {t?.agent && <span className="chip">agent · {t.agent}</span>}
          </div>
          {tok?.description && <p className="text-sm text-[var(--muted)] max-w-2xl">{tok.description}</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="stat"><div className="k">market cap</div><div className="v">{usd(tok?.marketCapUsd)}</div><div className="k">pump.fun live</div></div>
            <div className="stat"><div className="k">to graduation</div><div className="v grad-lime">{tok?.bondingProgressPct ?? 0}%</div><div className="k">$69K target</div></div>
            <div className="stat"><div className="k">creator fees</div><div className="v">{fees.earnedSol != null ? `${fees.earnedSol}` : (fees.creatorFeesSol ?? "—")}</div><div className="k">SOL earned</div></div>
            <div className="stat"><div className="k">agent pnl</div><div className="v grad-lime">{fees.agentPnlSol != null ? `+${fees.agentPnlSol}` : "—"}</div><div className="k">SOL</div></div>
          </div>

          <div className="grid gap-1 sm:grid-cols-3 mono text-[11px]">
            <div><span className="text-[var(--muted)]">mint </span><a className="underline" target="_blank" rel="noreferrer" href={t?.links?.solscan}>{t?.mint?.slice(0, 10)}…</a></div>
            <div><span className="text-[var(--muted)]">creator </span>{tok?.creator ? `${String(tok.creator).slice(0, 8)}…` : "—"}</div>
            <div><span className="text-[var(--muted)]">created </span>{t?.launchDate ?? (tok?.createdAt ? new Date(tok.createdAt).toLocaleDateString() : "—")}</div>
            <div><span className="text-[var(--muted)]">supply </span>{tok?.totalSupply ? tok.totalSupply.toLocaleString() : "—"}</div>
            <div><span className="text-[var(--muted)]">virtual SOL </span>{tok?.virtualSolReserves != null ? `${tok.virtualSolReserves.toFixed(2)}` : "—"}</div>
            <div><span className="text-[var(--muted)]">creator allocation </span>{fees.creatorAllocationPct != null ? `${fees.creatorAllocationPct}%` : "—"}</div>
          </div>

          <div className="flex flex-wrap gap-1">
            <a className="chip chip-on" target="_blank" rel="noreferrer" href={t?.links?.pumpfun}>buy on pump.fun ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={t?.links?.clawpump}>clawpump ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={t?.links?.dexscreener}>dexscreener ↗</a>
            <a className="chip" target="_blank" rel="noreferrer" href={t?.links?.solscan}>solscan ↗</a>
            <Link className="chip" href={t?.links?.ourPreview ?? "/coins"}>our preview →</Link>
          </div>
          <p className="mono text-[10px] text-[var(--muted)]">updated {when}</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <p className="kicker m-0">fee flow · read live from clawpump</p>
          <div className="mt-3 space-y-1 mono text-[11px]">
            <Row k="creator fees earned" v={fees.earnedSol != null ? `${fees.earnedSol} SOL` : "—"} />
            <Row k="fees sent to agent" v={fees.sentSol != null ? `${fees.sentSol} SOL` : "—"} />
            <Row k="claimable now" v={fees.creatorFeesSol != null ? `${fees.creatorFeesSol} SOL` : "—"} />
            <Row k="buybacks spent" v={fees.buybackSpentSol != null ? `${fees.buybackSpentSol} SOL` : "—"} />
            <Row k="strategy funding" v={fees.strategyFundingSol != null ? `${fees.strategyFundingSol} SOL` : "—"} />
            <Row k="allocation" v={fees.allocation ? `${fees.allocation.buybackPct}% buyback · ${fees.allocation.operationsPct}% ops` : "—"} />
          </div>
          <p className="mono text-[10px] text-[var(--muted)] mt-3">
            the agent routes creator fees on-chain; the launch tx and every payout are verifiable.
          </p>
        </section>

        <section className="panel p-4">
          <p className="kicker m-0">real payout history · on-chain</p>
          <div className="mt-3 space-y-1 mono text-[11px] max-h-64 overflow-y-auto">
            {(t?.feeEvents ?? []).length === 0 && <div className="text-[var(--muted)]">no fee events parsed yet</div>}
            {(t?.feeEvents ?? []).map((e) => (
              <a key={e.sig} href={`https://solscan.io/tx/${e.sig}`} target="_blank" rel="noreferrer"
                 className="flex items-center gap-2 border-b border-[var(--line)] pb-1 hover:opacity-80">
                <span className="text-[var(--lime)]">{e.sol != null ? `${e.sol} SOL` : "fee"}</span>
                <span className="text-[var(--muted)]">{e.label ?? "transfer"}</span>
                <span className="text-[var(--cyan)] ml-auto">{e.sig.slice(0, 10)}… ↗</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      <section className="panel p-4">
        <p className="kicker m-0">how our side works</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-[12px]">
          <div>
            <p className="text-[var(--lime)] font-bold">1 · launch</p>
            <p className="text-[var(--muted)]">A prompt becomes a coin: the brain names it, FLUX draws it, the treasury mints real devnet SPL supply.</p>
          </div>
          <div>
            <p className="text-[var(--lime)] font-bold">2 · trade</p>
            <p className="text-[var(--muted)]">Our market is a constant-product curve settled on-chain — your wallet signs only its own transfer, the treasury releases the other side.</p>
          </div>
          <div>
            <p className="text-[var(--lime)] font-bold">3 · agents</p>
            <p className="text-[var(--muted)]">Agents get their own funded devnet wallets, think with the live brain, and launch/trade for real. Fees route like the token above.</p>
          </div>
        </div>
        <p className="mono text-[10px] text-[var(--muted)] mt-3">
          sources: {t?.sources?.join(" · ") || "…"} — if a source is down its row shows “—”, never a made-up number.
        </p>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--line)] pb-1">
      <span className="text-[var(--muted)]">{k}</span>
      <span>{v}</span>
    </div>
  );
}
