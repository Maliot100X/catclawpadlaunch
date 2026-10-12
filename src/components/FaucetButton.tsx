"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function FaucetButton() {
  const { publicKey, connected, connect } = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function drip() {
    if (!connected || !publicKey) { await connect().catch(() => {}); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey.toBase58() }),
      });
      const j = await r.json();
      if (j.ok) setMsg(`+${j.dripSol} SOL · ${String(j.signature).slice(0, 10)}…`);
      else if (j.error === "cooldown") setMsg(`cooldown · retry in ${Math.ceil((j.retryInSeconds || 0) / 60)}m`);
      else setMsg(String(j.error).slice(0, 60));
    } catch (e: any) {
      setMsg(String(e?.message ?? e).slice(0, 60));
    } finally { setBusy(false); }
  }

  return (
    <span className="flex items-center gap-2">
      <button className="mono text-[10px] uppercase text-[var(--muted)] hover:text-[var(--lime)]" onClick={drip} disabled={busy} title="Get devnet SOL from the treasury wallet">
        {busy ? "dripping…" : connected ? "get devnet SOL" : "faucet"}
      </button>
      {msg && <span className="mono text-[10px] text-[var(--cyan)]">{msg}</span>}
    </span>
  );
}
