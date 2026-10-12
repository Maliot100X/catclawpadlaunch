"use client";
import { useWallet } from "@solana/wallet-adapter-react";

export function WalletBar() {
  const { publicKey, connected, connect, disconnect, connecting } = useWallet();
  const short = publicKey ? `${publicKey.toBase58().slice(0,4)}…${publicKey.toBase58().slice(-4)}` : null;

  if (connected && short) {
    return (
      <button className="btn btn-wallet mono text-[10px]" onClick={() => disconnect()}>
        {short}
      </button>
    );
  }
  return (
    <button className="btn btn-wallet mono text-[10px]" onClick={() => connect().catch(()=>{})} disabled={connecting}>
      {connecting ? "connecting…" : "CONNECT WALLET"}
    </button>
  );
}
