"use client";

import Link from "next/link";

export default function TokenomicsPage() {
  return (
    <div className="space-y-10">
      <div>
        <p className="k">how the platform makes money · and where it goes</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">TOKENOMICS</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          ClawPad earns small fees on launches and credit trades. Net revenue can buy back + burn a platform token when
          you launch one — same loop as modern viral launchers, tuned for LLM credits utility.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["01", "CREATION FEE", "0.05–0.58 SOL", "Launch fee box on forge. Paid only when you launch."],
          ["02", "TRADING FEE", "optional %", "On buys through ClawPad trade UI. Sells can stay free."],
          ["03", "CREDIT SPREAD", "20–40%", "Market sells credits below retail; protocol keeps spread + utility."],
        ].map(([n, t, v, d]) => (
          <div key={n} className="card p-5">
            <div className="mono text-xs text-[var(--accent)]">{n}</div>
            <div className="mt-2 font-bold tracking-wide">{t}</div>
            <div className="mt-1 text-2xl font-bold text-[var(--accent2)]">{v}</div>
            <p className="mt-2 text-xs text-[var(--muted)]">{d}</p>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <p className="k mb-4">the loop · 100% of net revenue (when $CLAW live)</p>
        <div className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-semibold">
          {["FEES", "→", "TREASURY", "→", "BUYBACK", "→", "BURN"].map((x) =>
            x === "→" ? (
              <span key={Math.random()} className="text-[var(--muted)]">
                →
              </span>
            ) : (
              <span key={x} className="rounded-full border border-line px-4 py-2 bg-[#05060d]">
                {x}
              </span>
            )
          )}
        </div>
        <p className="mt-5 text-center text-xs text-[var(--muted)] max-w-xl mx-auto">
          Net = fees − servers − AI − RPC. Buybacks in batches, logged on-chain. Until platform token exists, fees fund
          devnet ops + credit liquidity.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/launch" className="btn btn-primary">
          open forge
        </Link>
        <Link href="/market" className="btn">
          credits market
        </Link>
        <Link href="/trade" className="btn btn-go">
          trade
        </Link>
      </div>
    </div>
  );
}
