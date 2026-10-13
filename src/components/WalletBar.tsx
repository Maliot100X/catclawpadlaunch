"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletBar() {
  const { publicKey, connected, disconnect, connecting, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const short = publicKey ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}` : null;

  if (connected && short) {
    return (
      <span className="flex items-center gap-1">
        <button
          className="btn btn-wallet mono text-[10px]"
          title={`${wallet?.adapter.name ?? "wallet"} · ${publicKey?.toBase58()}`}
          onClick={() => { try { navigator.clipboard?.writeText(publicKey!.toBase58()); } catch { /* ignore */ } }}
        >
          {short}
        </button>
        <button className="mono text-[10px] uppercase text-[var(--muted)] hover:text-[#ff6b9d]" onClick={() => disconnect()}>
          disconnect
        </button>
      </span>
    );
  }

  return (
    <button className="btn btn-wallet mono text-[10px]" onClick={() => setVisible(true)} disabled={connecting}>
      {connecting ? "connecting…" : "CONNECT WALLET"}
    </button>
  );
}
